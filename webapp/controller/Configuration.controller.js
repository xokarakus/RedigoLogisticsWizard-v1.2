sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Input",
  "sap/m/Label",
  "sap/m/Button",
  "sap/ui/layout/form/SimpleForm",
  "com/redigo/logistics/cockpit/util/API",
  "./config/WarehouseMixin",
  "./config/FieldMappingMixin",
  "./config/FlowDesignerMixin",
  "./config/SecurityMixin",
  "./config/ServiceUsersMixin"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Input, Label, MButton, SimpleForm, API,
             WarehouseMixin, FieldMappingMixin, FlowDesignerMixin, SecurityMixin, ServiceUsersMixin) {
  "use strict";

  // Mixin'leri prototype seviyesinde birlestir (onInit'ten ONCE)
  // SAPUI5 XMLView event handler'lari view parse sirasinda cozumler,
  // bu nedenle metotlar Controller.extend taniminda olmali.
  var oProto = jQuery.extend({},
    WarehouseMixin, FieldMappingMixin, FlowDesignerMixin, SecurityMixin, ServiceUsersMixin,
    {
      onInit: function () {
        this._oModel = new JSONModel({
          warehouses: [],
          warehouseCount: 0,
          fieldMappings: [], fieldMappingsFiltered: [], fieldMappingCount: 0,
          selectedFM: null, selectedFMTitle: "", selectedFMSapJson: "", selectedFM3plJson: "", selectedFMRules: [],
          selectedFMHeaders: [], selectedFMSecurityId: "", selectedFMDirection: "SAP_TO_3PL",
          securityForCompany: [], fmTreeNodes: [],
          outputHeaders: "", outputJson: "", outputSecurity: "",
          selectedFMMethod: "POST", selectedFMApiEndpoint: "", selectedFMTimeout: 30000,
          selectedFMSourceApi: "", selectedFMSourceSecurityId: "",
          sourceSecurityProfiles: [],
          testInputJson: "", testResponseJson: "", testStatus: "", testStatusState: "None",
          securityProfiles: [], securityCount: 0,
          serviceUsers: [], serviceUserCount: 0
        });
        this.getView().setModel(this._oModel, "cfg");

        // E-posta ayarlari modeli
        this._oEmailModel = new JSONModel({
          smtp_host: "", smtp_port: "587", smtp_secure_key: "false",
          smtp_user: "", smtp_pass: "", smtp_from: "", app_url: ""
        });
        this.getView().setModel(this._oEmailModel, "emailCfg");

        this._loadData();
        this._loadEmailSettings();
      },

      _getText: function (sKey, aArgs) {
        var oBundle = this.getView().getModel("i18n").getResourceBundle();
        return oBundle.getText(sKey, aArgs);
      },

      _loadData: function () {
        var that = this;
        var fnErr = function (err) { console.error("Config API error", err); };

        // Warehouses ve field mappings birlikte yükle (enrichment için)
        var pWarehouses = API.get("/api/config/warehouses").then(function (result) {
          var aData = result.data || [];
          that._oModel.setProperty("/warehouses", aData);
          that._oModel.setProperty("/warehouseCount", aData.length);
          return aData;
        }).catch(function (err) { fnErr(err); return []; });

        var pFieldMappings = API.get("/api/config/field-mappings").then(function (result) {
          var aData = result.data || [];
          aData.forEach(function (fm) { fm.ruleCount = (fm.field_rules || []).length; });
          return aData;
        }).catch(function (err) { fnErr(err); return []; });

        // Her iki liste yüklenince field mapping'leri depo bilgisiyle zenginleştir
        Promise.all([pWarehouses, pFieldMappings]).then(function (results) {
          var aWarehouses = results[0];
          var aFM = results[1];
          var whMap = {};
          aWarehouses.forEach(function (w) { whMap[w.id] = w; });
          aFM.forEach(function (fm) {
            var wh = fm.warehouse_id ? whMap[fm.warehouse_id] : null;
            if (!wh && fm.company_code) {
              // Fallback: company_code ile ilk eşleşen depo
              wh = aWarehouses.find(function (w) { return w.company_code === fm.company_code; });
            }
            fm._warehouse_name = wh ? wh.name : "";
            fm._sap_plant = wh ? (wh.sap_plant || "") : "";
          });
          that._oModel.setProperty("/fieldMappings", aFM);
          that._oModel.setProperty("/fieldMappingsFiltered", aFM);
          that._oModel.setProperty("/fieldMappingCount", aFM.length);
        }).catch(fnErr);

        API.get("/api/config/security-profiles").then(function (result) {
          var aData = result.data || [];
          that._oModel.setProperty("/securityProfiles", aData);
          that._oModel.setProperty("/securityCount", aData.length);
        }).catch(fnErr);

        API.get("/api/v1/service-users").then(function (result) {
          var aData = result.data || [];
          aData.forEach(function (su) {
            su._scopesText = (su.scopes || []).join(", ");
            su._lastUsedFormatted = su.last_used_at
              ? new Date(su.last_used_at).toLocaleString("tr-TR")
              : "-";
          });
          that._oModel.setProperty("/serviceUsers", aData);
          that._oModel.setProperty("/serviceUserCount", aData.length);
        }).catch(fnErr);
      },

      onRefresh: function () {
        this._loadData();
        this._loadEmailSettings();
        MessageToast.show(this._getText("msgRefreshed"));
      },

      /* ── E-posta Ayarlari ── */

      _loadEmailSettings: function () {
        var that = this;
        API.get("/api/config/settings/email").then(function (res) {
          if (res.data) {
            var d = res.data;
            d.smtp_secure_key = d.smtp_secure === true || d.smtp_secure === "true" ? "true" : "false";
            that._oEmailModel.setData(d);
          }
        }).catch(function () {
          MessageToast.show(that._getText("errEmailSettingsLoad"));
        });
      },

      onSaveEmailSettings: function () {
        var oData = this._oEmailModel.getData();
        var that = this;

        if (!oData.smtp_host || !oData.smtp_from) {
          MessageToast.show(this._getText("msgRequiredFields"));
          return;
        }

        var oPayload = {
          smtp_host: oData.smtp_host.trim(),
          smtp_port: oData.smtp_port || "587",
          smtp_secure: oData.smtp_secure_key === "true",
          smtp_user: (oData.smtp_user || "").trim(),
          smtp_pass: oData.smtp_pass || "",
          smtp_from: oData.smtp_from.trim(),
          app_url: (oData.app_url || "").trim()
        };

        API.put("/api/config/settings/email", { value: oPayload }).then(function (res) {
          if (res.error) {
            MessageBox.error(res.error);
            return;
          }
          MessageToast.show(that._getText("msgSaved"));
        }).catch(function () {
          MessageToast.show(that._getText("errEmailSettingsSave"));
        });
      },

      onTestEmail: function () {
        var that = this;
        var oEmailInput = new Input({ type: "Email", placeholder: "test@company.com" });
        var oDialog = new Dialog({
          title: that._getText("emailTestSend"),
          contentWidth: "380px",
          content: [
            new SimpleForm({
              editable: true,
              content: [
                new Label({ text: that._getText("adminEmail"), required: true }),
                oEmailInput
              ]
            })
          ],
          beginButton: new MButton({
            text: that._getText("emailTestSend"),
            type: "Emphasized",
            press: function () {
              var sTo = oEmailInput.getValue().trim();
              if (!sTo) {
                MessageToast.show(that._getText("msgRequiredFields"));
                return;
              }
              API.post("/api/config/settings/email/test", { to: sTo }).then(function (res) {
                if (res.error) {
                  MessageBox.error(res.error);
                } else {
                  MessageToast.show(res.message || that._getText("msgSuccess"));
                }
                oDialog.close();
              }).catch(function () {
                MessageToast.show(that._getText("errTestEmailSend"));
                oDialog.close();
              });
            }
          }),
          endButton: new MButton({
            text: that._getText("cfgCancel"),
            press: function () { oDialog.close(); }
          }),
          afterClose: function () { oDialog.destroy(); }
        });
        this.getView().addDependent(oDialog);
        oDialog.open();
      },

      /* ── Şablona Kaydet (SUPER_ADMIN) ── */

      onSaveAsTemplate: function () {
        var that = this;
        var oFound = this._getSelectedFMProfile ? this._getSelectedFMProfile() : null;
        if (!oFound) {
          MessageToast.show(that._getText("fmSelectProfile"));
          return;
        }
        var oProfile = oFound.profile;

        var oCode = new Input({ value: oProfile.company_code || "", placeholder: "ABC_LOG", maxLength: 30 });
        var oName = new Input({ value: oProfile.description || "", placeholder: "ABC Lojistik A.S." });
        var oDesc = new Input({ placeholder: "" });

        var oDialog = new Dialog({
          title: that._getText("cfgSaveAsTemplate"),
          contentWidth: "400px",
          content: [
            new SimpleForm({
              editable: true,
              layout: "ResponsiveGridLayout",
              labelSpanL: 4, labelSpanM: 4,
              content: [
                new Label({ text: that._getText("cfgCode"), required: true }), oCode,
                new Label({ text: that._getText("cfgName"), required: true }), oName,
                new Label({ text: that._getText("cfgDescription") }), oDesc
              ]
            })
          ],
          beginButton: new MButton({
            text: that._getText("cfgSave"),
            type: "Emphasized",
            press: function () {
              var sCode = oCode.getValue().trim();
              var sName = oName.getValue().trim();
              if (!sCode || !sName) {
                MessageToast.show(that._getText("msgRequiredFields"));
                return;
              }

              // Se\u00e7ili field mapping'i strip edip template_data olarak g\u00f6nder
              var oFm = {};
              ["company_code", "description", "direction", "category",
               "http_method", "api_endpoint", "timeout_ms",
               "sap_sample_json", "threepl_sample_json", "threepl_response_sample_json",
               "field_rules", "response_rules", "headers"].forEach(function (k) {
                if (oProfile[k] !== undefined) oFm[k] = oProfile[k];
              });

              oDialog.setBusy(true);
              API.post("/api/v1/config/wizard/providers", {
                code: sCode,
                name: sName,
                description: oDesc.getValue().trim() || null,
                template_data: {
                  field_mappings: [oFm]
                }
              }).then(function (res) {
                oDialog.setBusy(false);
                if (res.error) {
                  MessageBox.error(res.error);
                  return;
                }
                MessageToast.show(that._getText("cfgSaveAsTemplate") + " \u2714");
                oDialog.close();
              }).catch(function (err) {
                oDialog.setBusy(false);
                MessageBox.error(err.message || that._getText("msgError"));
              });
            }
          }),
          endButton: new MButton({
            text: that._getText("cfgCancel"),
            press: function () { oDialog.close(); }
          }),
          afterClose: function () { oDialog.destroy(); }
        });
        this.getView().addDependent(oDialog);
        oDialog.open();
      }
    }
  );

  return Controller.extend("com.redigo.logistics.cockpit.controller.Configuration", oProto);
});
