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
  "./config/ProcessMixin",
  "./config/FieldMappingMixin",
  "./config/FlowDesignerMixin",
  "./config/SecurityMixin"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Input, Label, MButton, SimpleForm, API,
             WarehouseMixin, ProcessMixin, FieldMappingMixin, FlowDesignerMixin, SecurityMixin) {
  "use strict";

  // Mixin'leri prototype seviyesinde birlestir (onInit'ten ONCE)
  // SAPUI5 XMLView event handler'lari view parse sirasinda cozumler,
  // bu nedenle metotlar Controller.extend taniminda olmali.
  var oProto = jQuery.extend({},
    WarehouseMixin, ProcessMixin, FieldMappingMixin, FlowDesignerMixin, SecurityMixin,
    {
      onInit: function () {
        this._oModel = new JSONModel({
          warehouses: [], mappings: [], processConfigs: [], processTypes: [],
          warehouseCount: 0, mappingCount: 0, processConfigCount: 0, processTypeCount: 0,
          selectedType: null, selectedTypeName: "", selectedTypeSteps: [],
          fieldMappings: [], fieldMappingsFiltered: [], fieldMappingCount: 0,
          selectedFM: null, selectedFMTitle: "", selectedFMSapJson: "", selectedFM3plJson: "", selectedFMRules: [],
          selectedFMHeaders: [], selectedFMSecurityId: "", selectedFMDirection: "SAP_TO_3PL",
          securityForCompany: [], fmTreeNodes: [],
          outputHeaders: "", outputJson: "", outputSecurity: "",
          selectedFMMethod: "POST", selectedFMApiEndpoint: "", selectedFMTimeout: 30000,
          selectedFMSourceApi: "", selectedFMSourceSecurityId: "",
          sourceSecurityProfiles: [],
          testInputJson: "", testResponseJson: "", testStatus: "", testStatusState: "None",
          securityProfiles: [], securityCount: 0
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
        API.get("/api/config/warehouses").then(function (result) {
          var aData = result.data || [];
          that._oModel.setProperty("/warehouses", aData);
          that._oModel.setProperty("/warehouseCount", aData.length);
        }).catch(fnErr);
        API.get("/api/config/process-configs").then(function (result) {
          var aData = result.data || [];
          that._oModel.setProperty("/processConfigs", aData);
          that._oModel.setProperty("/processConfigCount", aData.length);
        }).catch(fnErr);
        API.get("/api/config/process-types").then(function (result) {
          var aData = result.data || [];
          aData.forEach(function (t) { t.stepCount = (t.steps || []).length; });
          that._oModel.setProperty("/processTypes", aData);
          that._oModel.setProperty("/processTypeCount", aData.length);
        }).catch(fnErr);
        API.get("/api/config/field-mappings").then(function (result) {
          var aData = result.data || [];
          aData.forEach(function (fm) { fm.ruleCount = (fm.field_rules || []).length; });
          that._oModel.setProperty("/fieldMappings", aData);
          that._oModel.setProperty("/fieldMappingsFiltered", aData);
          that._oModel.setProperty("/fieldMappingCount", aData.length);
        }).catch(fnErr);
        API.get("/api/config/security-profiles").then(function (result) {
          var aData = result.data || [];
          that._oModel.setProperty("/securityProfiles", aData);
          that._oModel.setProperty("/securityCount", aData.length);
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
          MessageToast.show("E-posta ayarlar\u0131 y\u00fcklenemedi");
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
          MessageToast.show("E-posta ayarlar\u0131 kaydedilemedi");
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
                MessageToast.show("Test e-postas\u0131 g\u00f6nderilemedi");
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
      }
    }
  );

  return Controller.extend("com.redigo.logistics.cockpit.controller.Configuration", oProto);
});
