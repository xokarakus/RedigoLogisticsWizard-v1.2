sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/Select",
  "sap/m/TextArea",
  "sap/ui/core/Item",
  "sap/ui/layout/form/SimpleForm",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, Label, Input, Select, TextArea, Item, SimpleForm, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.Configuration", {
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
        selectedFMMethod: "POST", selectedFMApiEndpoint: "",
        selectedFMSourceApi: "", selectedFMSourceSecurityId: "",
        sourceSecurityProfiles: [],
        testInputJson: "", testResponseJson: "", testStatus: "", testStatusState: "None",
        securityProfiles: [], securityCount: 0
      });
      this.getView().setModel(this._oModel, "cfg");
      this._loadData();
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
      MessageToast.show(this._getText("msgRefreshed"));
    },

    /* ═══════════════════════════════════════════
       Depolar (Warehouses) CRUD
       ═══════════════════════════════════════════ */

    _openWarehouseDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("cfgEditWarehouse") : this._getText("cfgAddWarehouse");

      var oCode = new Input({ value: bEdit ? oExisting.code : "", placeholder: "WH-IST-01" });
      var oName = new Input({ value: bEdit ? oExisting.name : "" });
      var oPlant = new Input({ value: bEdit ? oExisting.sap_plant : "", placeholder: "1000" });
      var oSLoc = new Input({ value: bEdit ? oExisting.sap_stor_loc : "", placeholder: "0001" });
      var oWmsCode = new Input({ value: bEdit ? oExisting.wms_code : "" });
      var oCompanyCode = new Input({ value: bEdit ? oExisting.company_code : "", placeholder: "ABC_LOG" });
      var oSapPartner = new Input({ value: bEdit ? oExisting.sap_partner_no : "", placeholder: "0000100001" });
      var oActive = new Select({ selectedKey: bEdit ? String(oExisting.is_active) : "true" });
      oActive.addItem(new Item({ key: "true", text: this._getText("cfgActiveYes") }));
      oActive.addItem(new Item({ key: "false", text: this._getText("cfgActiveNo") }));

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0,
        columnsXL: 1, columnsL: 1, columnsM: 1,
        content: [
          new Label({ text: this._getText("cfgCode"), required: true }), oCode,
          new Label({ text: this._getText("cfgName"), required: true }), oName,
          new Label({ text: this._getText("cfgPlant"), required: true }), oPlant,
          new Label({ text: this._getText("cfgStorLoc") }), oSLoc,
          new Label({ text: this._getText("cfgWMSCode") }), oWmsCode,
          new Label({ text: this._getText("cfgCompany"), required: true }), oCompanyCode,
          new Label({ text: this._getText("cfgSapPartner") }), oSapPartner,
          new Label({ text: this._getText("cfgActive") }), oActive
        ]
      });

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "500px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var oPayload = {
              code: oCode.getValue().trim(),
              name: oName.getValue().trim(),
              sap_plant: oPlant.getValue().trim(),
              sap_stor_loc: oSLoc.getValue().trim(),
              wms_code: oWmsCode.getValue().trim(),
              company_code: oCompanyCode.getValue().trim(),
              sap_partner_no: oSapPartner.getValue().trim(),
              is_active: oActive.getSelectedKey() === "true"
            };
            if (!oPayload.code || !oPayload.name || !oPayload.sap_plant) {
              MessageBox.error(that._getText("msgRequiredFields"));
              return;
            }
            var pReq = bEdit
              ? API.put("/api/config/warehouses/" + oExisting.id, oPayload)
              : API.post("/api/config/warehouses", oPayload);
            pReq.then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._loadData();
                oDialog.close();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onAddWarehouse: function () { this._openWarehouseDialog(null); },

    onEditWarehouse: function (oEvent) {
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      this._openWarehouseDialog(oItem);
    },

    /* ═══════════════════════════════════════════
       Süreç Uyarlamaları (Process Configs) CRUD
       ═══════════════════════════════════════════ */

    _openProcessConfigDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("cfgEditProcessConfig") : this._getText("cfgAddProcessConfig");

      var oPlant = new Input({ value: bEdit ? oExisting.plant_code : "", placeholder: "1000" });

      // Depo: Select (warehouses listesinden)
      var oWarehouse = new Select({ selectedKey: bEdit ? oExisting.warehouse_code : "" });
      var aWarehouses = this._oModel.getProperty("/warehouses") || [];
      aWarehouses.forEach(function (w) {
        if (w.is_active) {
          oWarehouse.addItem(new Item({ key: w.code, text: w.code + " \u2013 " + w.name }));
        }
      });

      var oDelType = new Input({ value: bEdit ? oExisting.delivery_type : "", placeholder: "LF" });
      var oDelTypeDesc = new Input({ value: bEdit ? oExisting.delivery_type_desc : "" });

      // Surec Tipi: Select (process_types listesinden)
      var aTypes = this._oModel.getProperty("/processTypes") || [];
      var oProcessType = new Select({ selectedKey: bEdit ? oExisting.process_type : "" });
      aTypes.forEach(function (t) {
        oProcessType.addItem(new Item({ key: t.code, text: t.code + " - " + t.name }));
      });

      var oMvtType = new Input({ value: bEdit ? oExisting.mvt_type : "", placeholder: "601" });

      // Lojistik Saglayici: Select (warehouses'dan unique company_code'lar)
      var oProvider = new Select({ selectedKey: bEdit ? oExisting.company_code : "" });
      var aWhForProvider = this._oModel.getProperty("/warehouses") || [];
      var providerMap = {};
      aWhForProvider.forEach(function (w) {
        if (w.company_code && !providerMap[w.company_code]) {
          oProvider.addItem(new Item({ key: w.company_code, text: w.company_code }));
          providerMap[w.company_code] = true;
        }
      });
      if (bEdit && oExisting.company_code && !providerMap[oExisting.company_code]) {
        oProvider.insertItem(new Item({ key: oExisting.company_code, text: oExisting.company_code }), 0);
      }
      var oCompanyName = new Input({ value: bEdit ? oExisting.company_name : "" });

      var oApiUrl = new Input({ value: bEdit ? oExisting.api_base_url : "", placeholder: "https://api.example.com/v1" });
      var oBapi = new Input({ value: bEdit ? oExisting.bapi_name : "BAPI_GOODSMVT_CREATE" });
      var oGmCode = new Input({ value: bEdit ? oExisting.gm_code : "", placeholder: "03" });

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0,
        columnsXL: 1, columnsL: 1, columnsM: 1,
        content: [
          new Label({ text: this._getText("cfgPlant"), required: true }), oPlant,
          new Label({ text: this._getText("invWarehouse"), required: true }), oWarehouse,
          new Label({ text: this._getText("cfgDeliveryType"), required: true }), oDelType,
          new Label({ text: this._getText("cfgDeliveryTypeDesc") }), oDelTypeDesc,
          new Label({ text: this._getText("cfgProcessType"), required: true }), oProcessType,
          new Label({ text: this._getText("cfgMvtType"), required: true }), oMvtType,
          new Label({ text: this._getText("cfgCompany"), required: true }), oProvider,
          new Label({ text: this._getText("cfgCompanyCode") }), oCompanyName,
          new Label({ text: this._getText("cfgApiBaseUrl") }), oApiUrl,
          new Label({ text: this._getText("cfgBapiName") }), oBapi,
          new Label({ text: this._getText("cfgGmCode") }), oGmCode
        ]
      });

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "600px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var oPayload = {
              plant_code: oPlant.getValue().trim(),
              warehouse_code: oWarehouse.getSelectedKey(),
              delivery_type: oDelType.getValue().trim(),
              delivery_type_desc: oDelTypeDesc.getValue().trim(),
              process_type: oProcessType.getSelectedKey(),
              mvt_type: oMvtType.getValue().trim(),
              company_code: oProvider.getSelectedKey(),
              company_name: oCompanyName.getValue().trim(),
              api_base_url: oApiUrl.getValue().trim(),
              bapi_name: oBapi.getValue().trim(),
              gm_code: oGmCode.getValue().trim()
            };
            if (!oPayload.plant_code || !oPayload.warehouse_code || !oPayload.delivery_type || !oPayload.process_type || !oPayload.mvt_type) {
              MessageBox.error(that._getText("msgRequiredFields"));
              return;
            }
            var pReq = bEdit
              ? API.put("/api/config/process-configs/" + oExisting.id, oPayload)
              : API.post("/api/config/process-configs", oPayload);
            pReq.then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._loadData();
                oDialog.close();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onAddProcessConfig: function () { this._openProcessConfigDialog(null); },

    onEditProcessConfig: function (oEvent) {
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      this._openProcessConfigDialog(oItem);
    },

    onDeleteProcessConfig: function (oEvent) {
      var that = this;
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            API.del("/api/config/process-configs/" + oItem.id).then(function (result) {
              if (result.success) {
                MessageToast.show(that._getText("msgDeleted"));
                that._loadData();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }
      });
    },

    /* ═══════════════════════════════════════════
       Süreç Tipleri (Process Types) CRUD
       ═══════════════════════════════════════════ */

    onSelectProcessType: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      if (!oItem) return;
      var oType = oItem.getBindingContext("cfg").getObject();
      this._oModel.setProperty("/selectedType", oType.id);
      this._oModel.setProperty("/selectedTypeName", oType.code + " - " + oType.name);
      this._oModel.setProperty("/selectedTypeSteps", oType.steps || []);
    },

    _openProcessTypeDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("cfgEditProcessType") : this._getText("cfgAddProcessType");

      var oCode = new Input({ value: bEdit ? oExisting.code : "", placeholder: "GI" });
      var oName = new Input({ value: bEdit ? oExisting.name : "" });
      var oSapTemplate = new TextArea({
        rows: 12,
        width: "100%"
      });
      oSapTemplate.setValue(bEdit ? JSON.stringify(oExisting.sap_sample_json || {}, null, 2) : "{}");
      oSapTemplate.setPlaceholder("HEADER / ITEMS JSON yapisi girin");

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        content: [
          new Label({ text: this._getText("cfgTypeCode"), required: true }), oCode,
          new Label({ text: this._getText("cfgTypeName"), required: true }), oName,
          new Label({ text: this._getText("cfgSapSampleJson") }), oSapTemplate
        ]
      });

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "550px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var sCode = oCode.getValue().trim();
            var sName = oName.getValue().trim();
            if (!sCode || !sName) { MessageBox.error(that._getText("msgRequiredFields")); return; }
            var oSapObj;
            try { oSapObj = JSON.parse(oSapTemplate.getValue().trim() || "{}"); } catch (e) {
              MessageBox.error("SAP JSON ge\u00e7ersiz: " + e.message); return;
            }
            var oPayload = { code: sCode, name: sName, sap_sample_json: oSapObj };
            if (!bEdit) { oPayload.steps = []; }
            var pReq = bEdit
              ? API.put("/api/config/process-types/" + oExisting.id, oPayload)
              : API.post("/api/config/process-types", oPayload);
            pReq.then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._oModel.setProperty("/selectedType", null);
                that._oModel.setProperty("/selectedTypeSteps", []);
                that._loadData();
                oDialog.close();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onAddProcessType: function () { this._openProcessTypeDialog(null); },

    onEditProcessType: function (oEvent) {
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      this._openProcessTypeDialog(oItem);
    },

    onDeleteProcessType: function (oEvent) {
      var that = this;
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            API.del("/api/config/process-types/" + oItem.id).then(function (result) {
              if (result.success) {
                MessageToast.show(that._getText("msgDeleted"));
                that._oModel.setProperty("/selectedType", null);
                that._oModel.setProperty("/selectedTypeSteps", []);
                that._loadData();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }
      });
    },

    /* ═══════════════════════════════════════════
       Adımlar (Steps) CRUD - within Process Type
       ═══════════════════════════════════════════ */

    _openStepDialog: function (oExisting, iIndex) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("cfgEditStep") : this._getText("cfgAddStep");

      var aSteps = this._oModel.getProperty("/selectedTypeSteps") || [];
      var iNextNo = bEdit ? oExisting.step_no : (aSteps.length > 0 ? Math.max.apply(null, aSteps.map(function (s) { return s.step_no; })) + 1 : 1);

      var oStepNo = new Input({ value: String(iNextNo), type: "Number" });
      var oName = new Input({ value: bEdit ? oExisting.name : "" });
      var oSource = new Input({ value: bEdit ? oExisting.source : "", placeholder: "SAP / 3PL / Middleware" });
      var oTarget = new Input({ value: bEdit ? oExisting.target : "", placeholder: "SAP / 3PL / Middleware" });
      var oDirection = new Select({ selectedKey: bEdit ? oExisting.direction : "INBOUND" });
      oDirection.addItem(new Item({ key: "INBOUND", text: "INBOUND" }));
      oDirection.addItem(new Item({ key: "OUTBOUND", text: "OUTBOUND" }));
      var oApi = new Input({ value: bEdit ? oExisting.api : "", placeholder: "/api/delivery/pull" });
      var oMethod = new Select({ selectedKey: bEdit ? (oExisting.method || "POST") : "POST" });
      oMethod.addItem(new Item({ key: "GET", text: "GET" }));
      oMethod.addItem(new Item({ key: "POST", text: "POST" }));
      oMethod.addItem(new Item({ key: "PUT", text: "PUT" }));
      oMethod.addItem(new Item({ key: "PATCH", text: "PATCH" }));
      var oContentType = new Input({ value: bEdit ? (oExisting.content_type || "application/json") : "application/json" });
      var oTimeout = new Input({ value: bEdit ? String(oExisting.timeout_ms || 30000) : "30000", type: "Number" });
      var oRetry = new Input({ value: bEdit ? String(oExisting.retry_count || 3) : "3", type: "Number" });

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        content: [
          new Label({ text: this._getText("cfgStepNo"), required: true }), oStepNo,
          new Label({ text: this._getText("cfgStepName"), required: true }), oName,
          new Label({ text: this._getText("cfgStepSource") }), oSource,
          new Label({ text: this._getText("cfgStepTarget") }), oTarget,
          new Label({ text: this._getText("cfgStepDirection") }), oDirection,
          new Label({ text: this._getText("cfgStepApi") }), oApi,
          new Label({ text: this._getText("cfgStepMethod") }), oMethod,
          new Label({ text: this._getText("cfgStepContentType") }), oContentType,
          new Label({ text: this._getText("cfgStepTimeout") }), oTimeout,
          new Label({ text: this._getText("cfgStepRetry") }), oRetry
        ]
      });

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "500px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var oStep = {
              step_no: parseInt(oStepNo.getValue(), 10),
              name: oName.getValue().trim(),
              source: oSource.getValue().trim(),
              target: oTarget.getValue().trim(),
              direction: oDirection.getSelectedKey(),
              api: oApi.getValue().trim(),
              method: oMethod.getSelectedKey(),
              content_type: oContentType.getValue().trim(),
              timeout_ms: parseInt(oTimeout.getValue(), 10) || 30000,
              retry_count: parseInt(oRetry.getValue(), 10) || 3
            };
            if (!oStep.name || isNaN(oStep.step_no)) { MessageBox.error(that._getText("msgRequiredFields")); return; }

            var sTypeId = that._oModel.getProperty("/selectedType");
            var aTypes = that._oModel.getProperty("/processTypes") || [];
            var oType = null;
            var iTypeIdx = -1;
            for (var i = 0; i < aTypes.length; i++) {
              if (aTypes[i].id === sTypeId) { oType = aTypes[i]; iTypeIdx = i; break; }
            }
            if (!oType) return;

            var aNewSteps = (oType.steps || []).slice();
            if (bEdit) {
              aNewSteps[iIndex] = oStep;
            } else {
              aNewSteps.push(oStep);
            }
            aNewSteps.sort(function (a, b) { return a.step_no - b.step_no; });

            API.put("/api/config/process-types/" + sTypeId, { steps: aNewSteps }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._oModel.setProperty("/selectedTypeSteps", aNewSteps);
                if (iTypeIdx >= 0) {
                  that._oModel.setProperty("/processTypes/" + iTypeIdx + "/steps", aNewSteps);
                  that._oModel.setProperty("/processTypes/" + iTypeIdx + "/stepCount", aNewSteps.length);
                }
                oDialog.close();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onAddStep: function () {
      if (!this._oModel.getProperty("/selectedType")) return;
      this._openStepDialog(null, -1);
    },

    onEditStep: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oStep = oCtx.getObject();
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);
      this._openStepDialog(oStep, iIndex);
    },

    onDeleteStep: function (oEvent) {
      var that = this;
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);

      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            var sTypeId = that._oModel.getProperty("/selectedType");
            var aTypes = that._oModel.getProperty("/processTypes") || [];
            var oType = null;
            var iTypeIdx = -1;
            for (var i = 0; i < aTypes.length; i++) {
              if (aTypes[i].id === sTypeId) { oType = aTypes[i]; iTypeIdx = i; break; }
            }
            if (!oType) return;

            var aNewSteps = (oType.steps || []).slice();
            aNewSteps.splice(iIndex, 1);

            API.put("/api/config/process-types/" + sTypeId, { steps: aNewSteps }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgDeleted"));
                that._oModel.setProperty("/selectedTypeSteps", aNewSteps);
                if (iTypeIdx >= 0) {
                  that._oModel.setProperty("/processTypes/" + iTypeIdx + "/steps", aNewSteps);
                  that._oModel.setProperty("/processTypes/" + iTypeIdx + "/stepCount", aNewSteps.length);
                }
              }
            });
          }
        }
      });
    },

    /* ═══════════════════════════════════════════
       Alan Eşleştirmeleri (Field Mappings) – Profil CRUD
       ═══════════════════════════════════════════ */

    onSearchFieldMapping: function (oEvent) {
      var sQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").toLowerCase().trim();
      var aAll = this._oModel.getProperty("/fieldMappings") || [];

      if (!sQuery) {
        this._oModel.setProperty("/fieldMappingsFiltered", aAll);
        return;
      }

      var aFiltered = aAll.filter(function (o) {
        return (o.company_code || "").toLowerCase().indexOf(sQuery) >= 0
          || (o.description || "").toLowerCase().indexOf(sQuery) >= 0
          || (o.direction || "").toLowerCase().indexOf(sQuery) >= 0
          || (o.process_type || "").toLowerCase().indexOf(sQuery) >= 0
          || (o.http_method || "").toLowerCase().indexOf(sQuery) >= 0;
      });
      this._oModel.setProperty("/fieldMappingsFiltered", aFiltered);
    },

    onSelectFieldMapping: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      if (!oItem) return;
      var oProfile = oItem.getBindingContext("cfg").getObject();
      this._oModel.setProperty("/selectedFM", oProfile.id);
      this._oModel.setProperty("/selectedFMTitle", oProfile.process_type + " \u2013 " + oProfile.company_code + " \u2013 " + oProfile.description);
      // Direction ONCE set et (buildSourceTree bu degere bakar)
      this._oModel.setProperty("/selectedFMDirection", oProfile.direction || "SAP_TO_3PL");
      this._oModel.setProperty("/selectedFMSapJson", JSON.stringify(oProfile.sap_sample_json || {}, null, 2));
      // 3PL JSON'u SAP verisi + kurallardan dinamik hesapla
      var computed3pl = this._rebuildThreeplJson(oProfile.field_rules || [], oProfile.sap_sample_json || {});
      this._oModel.setProperty("/selectedFM3plJson", JSON.stringify(computed3pl, null, 2));
      // Rules ve tree'yi en son set et (direction ve her iki JSON hazir)
      this._setFMRules(oProfile.field_rules || []);
      this._oModel.setProperty("/selectedFMHeaders", oProfile.headers || []);
      this._oModel.setProperty("/selectedFMSecurityId", oProfile.security_profile_id || "");
      this._oModel.setProperty("/selectedFMMethod", oProfile.http_method || "POST");
      this._oModel.setProperty("/selectedFMApiEndpoint", oProfile.api_endpoint || "");
      // Kaynak API: varsa kullan, yoksa otomatik olustur
      var sSourceApi = oProfile.source_api_endpoint;
      if (!sSourceApi) {
        sSourceApi = this._generateSourceApiPath(oProfile);
        // Backend'e kaydet
        var that2 = this;
        var iIdx = this._oModel.getProperty("/fieldMappings").indexOf(oProfile);
        API.put("/api/config/field-mappings/" + oProfile.id, { source_api_endpoint: sSourceApi }).then(function () {
          if (iIdx >= 0) that2._oModel.setProperty("/fieldMappings/" + iIdx + "/source_api_endpoint", sSourceApi);
        });
      }
      this._oModel.setProperty("/selectedFMSourceApi", sSourceApi);
      this._oModel.setProperty("/selectedFMSourceSecurityId", oProfile.source_security_profile_id || "");
      // Response rules yükle
      this._oModel.setProperty("/selectedFMResponseSampleJson",
        JSON.stringify(oProfile.threepl_response_sample_json || {}, null, 2));
      this._oModel.setProperty("/selectedFMResponseRules", oProfile.response_rules || []);
      this._oModel.setProperty("/responsePreviewJson", "");
      // Reset test area
      this._oModel.setProperty("/testInputJson", "");
      this._oModel.setProperty("/testResponseJson", "");
      this._oModel.setProperty("/testStatus", "");
      this._oModel.setProperty("/testStatusState", "None");
      // Reset output preview
      this._oModel.setProperty("/outputHeaders", "");
      this._oModel.setProperty("/outputJson", "");
      this._oModel.setProperty("/outputSecurity", "");
      // Filter security profiles for target (Hedef: Kokpit → 3PL)
      var aSec = this._oModel.getProperty("/securityProfiles") || [];
      var sCompany = oProfile.company_code;
      var aFiltered = [{ id: "", displayText: this._getText("fmNoSecurity") }];
      aSec.forEach(function (sp) {
        if (sp.company_code === sCompany) {
          aFiltered.push({ id: sp.id, displayText: sp.auth_type + " \u2013 " + sp.environment });
        }
      });
      this._oModel.setProperty("/securityForCompany", aFiltered);
      // Kaynak guvenlik profilleri (tum profiller — SAP tarafı)
      var aSourceSec = [{ id: "", displayText: this._getText("fmNoSecurity") }];
      aSec.forEach(function (sp) {
        aSourceSec.push({ id: sp.id, displayText: sp.company_code + " \u2013 " + sp.auth_type + " \u2013 " + sp.environment });
      });
      this._oModel.setProperty("/sourceSecurityProfiles", aSourceSec);
    },

    _openFieldMappingDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("fmEditProfile") : this._getText("fmAddProfile");

      var aTypes = this._oModel.getProperty("/processTypes") || [];
      var oProcessType = new Select({ selectedKey: bEdit ? oExisting.process_type : "" });
      oProcessType.addItem(new Item({ key: "", text: this._getText("cfgSelectProcessType") }));
      aTypes.forEach(function (t) {
        oProcessType.addItem(new Item({ key: t.code, text: t.code + " \u2013 " + t.name }));
      });
      var oCompany = new Select({ selectedKey: bEdit ? oExisting.company_code : "" });
      var aWhFM = this._oModel.getProperty("/warehouses") || [];
      var seenFM = {};
      aWhFM.forEach(function (w) {
        if (w.company_code && !seenFM[w.company_code]) {
          oCompany.addItem(new Item({ key: w.company_code, text: w.company_code }));
          seenFM[w.company_code] = true;
        }
      });
      if (bEdit && oExisting.company_code && !seenFM[oExisting.company_code]) {
        oCompany.insertItem(new Item({ key: oExisting.company_code, text: oExisting.company_code }), 0);
      }
      var oDesc = new Input({ value: bEdit ? oExisting.description : "" });
      var oSapJson = new TextArea({ rows: 10, width: "100%" });
      oSapJson.setValue(bEdit ? JSON.stringify(oExisting.sap_sample_json || {}, null, 2) : "{}");
      var o3plJson = new TextArea({ rows: 10, width: "100%" });
      o3plJson.setValue(bEdit ? JSON.stringify(oExisting.threepl_sample_json || {}, null, 2) : "{}");

      // S\u00fcre\u00e7 tipi de\u011fi\u015fti\u011finde SAP JSON \u015fablonunu otomatik doldur
      function fnAutoFillSapJson() {
        var sKey = oProcessType.getSelectedKey();
        if (!sKey) return;
        var oType = aTypes.find(function (t) { return t.code === sKey; });
        if (oType && oType.sap_sample_json && Object.keys(oType.sap_sample_json).length > 0) {
          var sCurrent = oSapJson.getValue().trim();
          if (!sCurrent || sCurrent === "{}" || sCurrent === "{ }") {
            oSapJson.setValue(JSON.stringify(oType.sap_sample_json, null, 2));
          }
        }
      }
      oProcessType.attachChange(fnAutoFillSapJson);

      var oDirection = new Select({ selectedKey: bEdit ? (oExisting.direction || "SAP_TO_3PL") : "SAP_TO_3PL" });
      oDirection.addItem(new Item({ key: "SAP_TO_3PL", text: "SAP \u2192 3PL" }));
      oDirection.addItem(new Item({ key: "3PL_TO_SAP", text: "3PL \u2192 SAP" }));
      var oHttpMethod = new Select({ selectedKey: bEdit ? (oExisting.http_method || "POST") : "POST" });
      oHttpMethod.addItem(new Item({ key: "POST", text: "POST" }));
      oHttpMethod.addItem(new Item({ key: "GET", text: "GET" }));
      oHttpMethod.addItem(new Item({ key: "PUT", text: "PUT" }));
      oHttpMethod.addItem(new Item({ key: "PATCH", text: "PATCH" }));
      var oApiEndpoint = new Input({ value: bEdit ? (oExisting.api_endpoint || "") : "", placeholder: "https://api.example.com/orders" });
      var oActive = new Select({ selectedKey: bEdit ? String(oExisting.is_active) : "true" });
      oActive.addItem(new Item({ key: "true", text: this._getText("cfgActiveYes") }));
      oActive.addItem(new Item({ key: "false", text: this._getText("cfgActiveNo") }));

      // Yone gore dinamik label'lar
      var sInitDir = oDirection.getSelectedKey();
      var oLblSapJson = new Label({ text: sInitDir === "3PL_TO_SAP" ? "3PL JSON (Kaynak)" : "SAP JSON (Kaynak)" });
      var oLbl3plJson = new Label({ text: sInitDir === "3PL_TO_SAP" ? "SAP JSON (Hedef)" : "3PL JSON (Hedef)" });
      oDirection.attachChange(function () {
        var sDir = oDirection.getSelectedKey();
        oLblSapJson.setText(sDir === "3PL_TO_SAP" ? "3PL JSON (Kaynak)" : "SAP JSON (Kaynak)");
        oLbl3plJson.setText(sDir === "3PL_TO_SAP" ? "SAP JSON (Hedef)" : "3PL JSON (Hedef)");
      });

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 3, labelSpanL: 3, labelSpanM: 3,
        emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0,
        columnsXL: 1, columnsL: 1, columnsM: 1,
        content: [
          new Label({ text: this._getText("cfgProcessType"), required: true }), oProcessType,
          new Label({ text: this._getText("fmCompanyCode"), required: true }), oCompany,
          new Label({ text: this._getText("cfgDescription") }), oDesc,
          new Label({ text: this._getText("fmDirection") }), oDirection,
          new Label({ text: this._getText("fmHttpMethod") }), oHttpMethod,
          new Label({ text: this._getText("fmApiEndpoint") }), oApiEndpoint,
          oLblSapJson, oSapJson,
          oLbl3plJson, o3plJson,
          new Label({ text: this._getText("cfgActive") }), oActive
        ]
      });

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "650px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var sSapRaw = oSapJson.getValue().trim() || "{}";
            var s3plRaw = o3plJson.getValue().trim() || "{}";
            var oSapObj, o3plObj;
            try { oSapObj = JSON.parse(sSapRaw); } catch (e) {
              MessageBox.error(that._getText("fmInvalidSAPJson")); return;
            }
            try { o3plObj = JSON.parse(s3plRaw); } catch (e) {
              MessageBox.error(that._getText("fmInvalid3PLJson")); return;
            }
            var oPayload = {
              process_type: oProcessType.getSelectedKey(),
              company_code: oCompany.getSelectedKey(),
              description: oDesc.getValue().trim(),
              direction: oDirection.getSelectedKey(),
              http_method: oHttpMethod.getSelectedKey(),
              api_endpoint: oApiEndpoint.getValue().trim(),
              sap_sample_json: oSapObj,
              threepl_sample_json: o3plObj,
              is_active: oActive.getSelectedKey() === "true"
            };
            if (bEdit) {
              oPayload.field_rules = oExisting.field_rules || [];
            } else {
              oPayload.field_rules = [];
            }
            if (!oPayload.process_type || !oPayload.company_code) {
              MessageBox.error(that._getText("msgRequiredFields")); return;
            }
            var pReq = bEdit
              ? API.put("/api/config/field-mappings/" + oExisting.id, oPayload)
              : API.post("/api/config/field-mappings", oPayload);
            pReq.then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._oModel.setProperty("/selectedFM", null);
                that._oModel.setProperty("/selectedFMRules", []);
                that._loadData();
                oDialog.close();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onAddFieldMapping: function () { this._openFieldMappingDialog(null); },

    onEditFieldMapping: function (oEvent) {
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      this._openFieldMappingDialog(oItem);
    },

    onDeleteFieldMapping: function (oEvent) {
      var that = this;
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            API.del("/api/config/field-mappings/" + oItem.id).then(function (result) {
              if (result.success) {
                MessageToast.show(that._getText("msgDeleted"));
                that._oModel.setProperty("/selectedFM", null);
                that._oModel.setProperty("/selectedFMRules", []);
                that._loadData();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }
      });
    },

    /* ═══════════════════════════════════════════
       Alan Kuralları (Field Rules) – Profil içi CRUD
       ═══════════════════════════════════════════ */

    _getSelectedFMProfile: function () {
      var sFmId = this._oModel.getProperty("/selectedFM");
      if (!sFmId) return null;
      var aFM = this._oModel.getProperty("/fieldMappings") || [];
      for (var i = 0; i < aFM.length; i++) {
        if (aFM[i].id === sFmId) return { profile: aFM[i], index: i };
      }
      return null;
    },

    /**
     * Kurallari duz array olarak saklar ve SAP JSON agacini gunceller.
     */
    _setFMRules: function (aRules) {
      // Dahili property'leri temizle (API'ye bulasmamasi icin)
      var rules = (aRules || []).map(function (r) {
        return { sap_field: r.sap_field, threepl_field: r.threepl_field, transform: r.transform };
      });
      this._oModel.setProperty("/selectedFMRules", rules);
      this._buildSourceTree();
    },

    /**
     * Kaynak JSON yapisindan agac modeli uretir.
     * Yon SAP_TO_3PL ise: kaynak = SAP JSON, hedef = threepl_field
     * Yon 3PL_TO_SAP ise: kaynak = 3PL JSON, hedef = sap_field
     */
    _buildSourceTree: function () {
      var sDirection = this._oModel.getProperty("/selectedFMDirection") || "SAP_TO_3PL";
      var bSapSource = (sDirection === "SAP_TO_3PL");
      var sSourceRaw = this._oModel.getProperty(bSapSource ? "/selectedFMSapJson" : "/selectedFM3plJson");
      var aRules = this._oModel.getProperty("/selectedFMRules") || [];

      // Kural lookup: sourceField → { targetField, transform, ruleIndex }
      var ruleMap = {};
      aRules.forEach(function (r, idx) {
        var sourceKey = bSapSource ? r.sap_field : r.threepl_field;
        var targetVal = bSapSource ? r.threepl_field : r.sap_field;
        if (sourceKey) ruleMap[sourceKey] = { targetField: targetVal || "", transform: r.transform || "DIRECT", _ruleIndex: idx };
      });

      var treeNodes = [];
      if (!sSourceRaw) { this._oModel.setProperty("/fmTreeNodes", treeNodes); return; }

      var data;
      try { data = JSON.parse(sSourceRaw); } catch (e) { this._oModel.setProperty("/fmTreeNodes", treeNodes); return; }
      if (Array.isArray(data) && data.length === 1) data = data[0];

      function fmtSample(val) {
        if (val === null || val === undefined) return "";
        if (typeof val === "object") return JSON.stringify(val).substring(0, 30);
        return String(val).length > 30 ? String(val).substring(0, 27) + "..." : String(val);
      }

      function buildFieldNode(fieldPath, sampleVal) {
        var rule = ruleMap[fieldPath];
        var shortName = fieldPath;
        var lastDot = fieldPath.lastIndexOf(".");
        if (lastDot >= 0) shortName = fieldPath.substring(lastDot + 1);
        return {
          _nodeType: "field",
          _sapField: fieldPath,
          _sapFieldShort: shortName,
          _sample: fmtSample(sampleVal),
          _mapped: !!rule && !!rule.targetField,
          _threepl: rule ? rule.targetField : "",
          _transform: rule ? rule.transform : "DIRECT",
          _ruleIndex: rule ? rule._ruleIndex : -1
        };
      }

      function buildGroupNode(label, childNodes) {
        var mapped = 0;
        var total = 0;
        // Sadece field cocuklari say (grup cocuklari haric)
        function countFields(nodes) {
          nodes.forEach(function (n) {
            if (n._nodeType === "field") { total++; if (n._mapped) mapped++; }
            if (n.children) countFields(n.children);
          });
        }
        countFields(childNodes);
        return {
          _nodeType: "group",
          _label: label + " (" + mapped + "/" + total + ")",
          _sapField: "", _sapFieldShort: "", _sample: "",
          _mapped: false, _threepl: "", _transform: "DIRECT", _ruleIndex: -1,
          children: childNodes
        };
      }

      /**
       * Rekursif: bir JSON objesinin key'lerini tree node'larina donusturur.
       * prefix: alan yolu prefix'i (ust seviyelerden gelen), ornegin "ITEMS[]."
       * label: grup etiketi (ornegin "ITEMS[]")
       */
      function processObject(obj, prefix) {
        var nodes = [];
        Object.keys(obj).forEach(function (key) {
          var val = obj[key];
          var fieldPath = prefix ? prefix + key : key;

          if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
            // Array of objects → grup node, icerideki objeyi rekursif isle
            var groupLabel = prefix ? prefix + key + "[]" : key + "[]";
            var childNodes = processObject(val[0], groupLabel + ".");
            nodes.push(buildGroupNode(key + "[]", childNodes));
          } else if (val !== null && typeof val === "object" && !Array.isArray(val)) {
            // Nested object → grup node, rekursif isle
            var childNodes2 = processObject(val, fieldPath + ".");
            nodes.push(buildGroupNode(key, childNodes2));
          } else {
            // Skaler alan → field node
            nodes.push(buildFieldNode(fieldPath, val));
          }
        });
        return nodes;
      }

      if (Array.isArray(data)) {
        // Root array — ilk elemanin key'lerini isle
        var sample = data[0];
        if (sample && typeof sample === "object") {
          treeNodes = processObject(sample, "");
        }
      } else if (typeof data === "object") {
        treeNodes = processObject(data, "");
      }

      this._oModel.setProperty("/fmTreeNodes", []);
      this._oModel.setProperty("/fmTreeNodes", treeNodes);
      // Tree binding'i zorla yenile (arrayNames ile binding bazen otomatik guncellenmez)
      var oTree = this.byId("fmRulesTree");
      if (oTree) {
        var oBinding = oTree.getBinding("items");
        if (oBinding) oBinding.refresh(true);
      }
    },

    _openFieldRuleDialog: function (oExisting, iIndex, sPreFillSapField) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("fmEditRule") : this._getText("fmAddRule");

      var oSapField = new Input({ value: bEdit ? oExisting.sap_field : (sPreFillSapField || ""), placeholder: "VBELN" });
      var o3plField = new Input({ value: bEdit ? oExisting.threepl_field : "", placeholder: "order_number" });
      var oTransform = new Select({ selectedKey: bEdit ? (oExisting.transform || "DIRECT") : "DIRECT" });
      oTransform.addItem(new Item({ key: "DIRECT", text: this._getText("fmDirectRule") }));
      oTransform.addItem(new Item({ key: "LOOKUP", text: this._getText("fmLookupRule") }));
      oTransform.addItem(new Item({ key: "PREFIX", text: this._getText("fmPrefixRule") }));
      oTransform.addItem(new Item({ key: "SAP_DATE", text: this._getText("fmSapDateRule") }));

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        content: [
          new Label({ text: this._getText("fmSAPField"), required: true }), oSapField,
          new Label({ text: this._getText("fm3PLField"), required: true }), o3plField,
          new Label({ text: this._getText("fmTransformRule") }), oTransform
        ]
      });

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "450px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var oRule = {
              sap_field: oSapField.getValue().trim(),
              threepl_field: o3plField.getValue().trim(),
              transform: oTransform.getSelectedKey()
            };
            if (!oRule.sap_field || !oRule.threepl_field) {
              MessageBox.error(that._getText("msgRequiredFields")); return;
            }

            var oFound = that._getSelectedFMProfile();
            if (!oFound) return;
            var aRules = (oFound.profile.field_rules || []).slice();
            if (bEdit) {
              aRules[iIndex] = oRule;
            } else {
              aRules.push(oRule);
            }

            // Textarea'daki guncel SAP JSON'u kullan
            var oCurrentSapJson = oFound.profile.sap_sample_json || {};
            var sSapRaw = that._oModel.getProperty("/selectedFMSapJson");
            if (sSapRaw) {
              try { oCurrentSapJson = JSON.parse(sSapRaw); } catch (_) { /* eski deger */ }
            }

            var new3plJson = that._rebuildThreeplJson(aRules, oCurrentSapJson);
            API.put("/api/config/field-mappings/" + oFound.profile.id, {
              field_rules: aRules,
              sap_sample_json: oCurrentSapJson,
              threepl_sample_json: new3plJson
            }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._setFMRules(aRules);
                that._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aRules);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aRules.length);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/sap_sample_json", oCurrentSapJson);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", new3plJson);
                oDialog.close();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onAddFieldRule: function () {
      if (!this._oModel.getProperty("/selectedFM")) return;
      this._openFieldRuleDialog(null, -1);
    },

    /**
     * Tree grup dugumundeki "+" butonundan eslesmemis alanlari popover ile gosterir.
     */
    onEditFieldRule: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oNode = oCtx.getObject();
      var iIndex = oNode._ruleIndex;
      if (iIndex < 0) return;
      var aRules = this._oModel.getProperty("/selectedFMRules") || [];
      var oRule = aRules[iIndex];
      if (!oRule) return;
      this._openFieldRuleDialog(oRule, iIndex);
    },

    onDeleteFieldRule: function (oEvent) {
      var that = this;
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oNode = oCtx.getObject();
      var iIndex = oNode._ruleIndex;
      if (iIndex < 0) return;

      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            var oFound = that._getSelectedFMProfile();
            if (!oFound) return;
            var aRules = (oFound.profile.field_rules || []).slice();
            aRules.splice(iIndex, 1);

            // Textarea'daki guncel SAP JSON'u kullan
            var oCurrentSapJson = oFound.profile.sap_sample_json || {};
            var sSapRaw = that._oModel.getProperty("/selectedFMSapJson");
            if (sSapRaw) {
              try { oCurrentSapJson = JSON.parse(sSapRaw); } catch (_) { /* eski deger */ }
            }

            var new3plJson = that._rebuildThreeplJson(aRules, oCurrentSapJson);
            API.put("/api/config/field-mappings/" + oFound.profile.id, {
              field_rules: aRules,
              sap_sample_json: oCurrentSapJson,
              threepl_sample_json: new3plJson
            }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgDeleted"));
                that._setFMRules(aRules);
                that._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aRules);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aRules.length);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/sap_sample_json", oCurrentSapJson);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", new3plJson);
              }
            });
          }
        }
      });
    },

    /* ═══════════════════════════════════════════
       Inline PO-Tarzi Degisiklik Handler'lari
       ═══════════════════════════════════════════ */

    /**
     * Hedef alan (threepl_field) inline degistiginde.
     * Kural yoksa yeni olusturur, varsa gunceller.
     */
    onTargetFieldChange: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oNode = oCtx.getObject();
      if (!oNode || oNode._nodeType !== "field") return;

      var sNewTarget = oEvent.getParameter("value").trim();
      var sSourceField = oNode._sapField;
      var sDirection = this._oModel.getProperty("/selectedFMDirection") || "SAP_TO_3PL";
      var bSapSource = (sDirection === "SAP_TO_3PL");
      var aRules = (this._oModel.getProperty("/selectedFMRules") || []).slice();

      if (oNode._ruleIndex >= 0) {
        // Mevcut kurali guncelle — yone gore dogru tarafi yaz
        if (bSapSource) {
          aRules[oNode._ruleIndex].threepl_field = sNewTarget;
        } else {
          aRules[oNode._ruleIndex].sap_field = sNewTarget;
        }
      } else {
        // Yeni kural olustur
        var newRule = { transform: oNode._transform || "DIRECT" };
        if (bSapSource) {
          newRule.sap_field = sSourceField;
          newRule.threepl_field = sNewTarget;
        } else {
          newRule.threepl_field = sSourceField;
          newRule.sap_field = sNewTarget;
        }
        aRules.push(newRule);
      }
      this._saveRulesAndRefresh(aRules);
    },

    /**
     * Donusum (transform) inline degistiginde.
     */
    onTransformChange: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oNode = oCtx.getObject();
      if (!oNode || oNode._nodeType !== "field") return;

      var sNewTransform = oEvent.getParameter("selectedItem").getKey();
      var sSourceField = oNode._sapField;
      var sDirection = this._oModel.getProperty("/selectedFMDirection") || "SAP_TO_3PL";
      var bSapSource = (sDirection === "SAP_TO_3PL");
      var aRules = (this._oModel.getProperty("/selectedFMRules") || []).slice();

      if (oNode._ruleIndex >= 0) {
        aRules[oNode._ruleIndex].transform = sNewTransform;
      } else {
        var newRule = { transform: sNewTransform };
        if (bSapSource) {
          newRule.sap_field = sSourceField;
          newRule.threepl_field = "";
        } else {
          newRule.threepl_field = sSourceField;
          newRule.sap_field = "";
        }
        aRules.push(newRule);
      }
      this._saveRulesAndRefresh(aRules);
    },

    /**
     * Ornek deger inline degistiginde — SAP JSON'u gunceller.
     */
    onSampleValueChange: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oNode = oCtx.getObject();
      if (!oNode || oNode._nodeType !== "field") return;

      var sNewValue = oEvent.getParameter("value");
      var sDirection = this._oModel.getProperty("/selectedFMDirection") || "SAP_TO_3PL";
      var bSapSource = (sDirection === "SAP_TO_3PL");
      var sSourceProp = bSapSource ? "/selectedFMSapJson" : "/selectedFM3plJson";
      var sSourceRaw = this._oModel.getProperty(sSourceProp);
      try {
        var oSourceJson = JSON.parse(sSourceRaw);
        this._setJsonPath(oSourceJson, oNode._sapField, sNewValue);
        this._oModel.setProperty(sSourceProp, JSON.stringify(oSourceJson, null, 2));
        // Hedef JSON'u da guncelle
        if (bSapSource) {
          var aRules = this._oModel.getProperty("/selectedFMRules") || [];
          var new3plJson = this._rebuildThreeplJson(aRules, oSourceJson);
          this._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
        }
      } catch (e) { /* JSON parse hatasi */ }
    },

    /**
     * JSON objesinde belirtilen yola deger yazar.
     * "HEADER.VBELN" → obj.HEADER.VBELN = value
     * "ITEMS[].MATNR" → obj.ITEMS[0].MATNR = value
     */
    _setJsonPath: function (obj, path, value) {
      if (!obj || !path) return;
      var resolved = path.replace(/\[\]/g, "[0]");
      var parts = resolved.split(".");
      var current = obj;

      for (var i = 0; i < parts.length - 1; i++) {
        var part = parts[i];
        var bracketMatch = part.match(/^(.*)\[(\d+)\]$/);
        if (bracketMatch) {
          if (bracketMatch[1]) current = current[bracketMatch[1]];
          if (Array.isArray(current)) current = current[parseInt(bracketMatch[2], 10)];
          else return;
        } else if (Array.isArray(current)) {
          current = current[0] ? current[0][part] : undefined;
        } else {
          current = current[part];
        }
        if (current === undefined || current === null) return;
      }

      var lastPart = parts[parts.length - 1];
      var lastBracket = lastPart.match(/^(.*)\[(\d+)\]$/);
      if (lastBracket) {
        if (lastBracket[1]) current = current[lastBracket[1]];
        if (Array.isArray(current)) current[parseInt(lastBracket[2], 10)] = value;
      } else {
        current[lastPart] = value;
      }
    },

    /**
     * Kuralları temizleyip API'ye kaydeder, tree ve JSON panellerini gunceller.
     */
    _saveRulesAndRefresh: function (aRules) {
      var that = this;
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      // Dahili property'leri temizle
      var cleanRules = aRules.map(function (r) {
        return { sap_field: r.sap_field, threepl_field: r.threepl_field, transform: r.transform };
      });

      // Textarea'daki guncel SAP JSON'u kullan (stale profile degil)
      var oCurrentSapJson = oFound.profile.sap_sample_json || {};
      var sSapRaw = this._oModel.getProperty("/selectedFMSapJson");
      if (sSapRaw) {
        try { oCurrentSapJson = JSON.parse(sSapRaw); } catch (_) { /* parse hatasinda eski deger */ }
      }

      var new3plJson = this._rebuildThreeplJson(cleanRules, oCurrentSapJson);
      API.put("/api/config/field-mappings/" + oFound.profile.id, {
        field_rules: cleanRules,
        sap_sample_json: oCurrentSapJson,
        threepl_sample_json: new3plJson
      }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("msgSaved"));
          that._setFMRules(cleanRules);
          that._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", cleanRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", cleanRules.length);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/sap_sample_json", oCurrentSapJson);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", new3plJson);
        } else {
          MessageBox.error(result.error || that._getText("msgError"));
        }
      });
    },

    /* ═══════════════════════════════════════════
       Flow Designer – JSON Çıkarma, Otomatik Eşleme, Başlıklar, Önizleme
       ═══════════════════════════════════════════ */

    /**
     * JSON objesi icindeki tum alanlari duz liste olarak cikarir.
     * Ic ice objeler "parent.child", diziler "parent[].child" seklinde gosterilir.
     */
    _flattenJsonKeys: function (obj, prefix) {
      var keys = [];
      prefix = prefix || "";
      if (!obj || typeof obj !== "object") return keys;

      // Root-level array: ilk elemanin key'lerini duz cikar (index prefix olmadan)
      if (Array.isArray(obj)) {
        if (obj.length > 0 && obj[0] !== null && typeof obj[0] === "object") {
          return this._flattenJsonKeys(obj[0], prefix);
        }
        return keys;
      }

      var self = this;
      Object.keys(obj).forEach(function (k) {
        var fullKey = prefix ? prefix + "." + k : k;
        var val = obj[k];
        if (Array.isArray(val)) {
          if (val.length > 0 && val[0] !== null && typeof val[0] === "object") {
            var nested = self._flattenJsonKeys(val[0], fullKey + "[]");
            keys = keys.concat(nested);
          } else {
            keys.push(fullKey);
          }
        } else if (val !== null && typeof val === "object") {
          var nested = self._flattenJsonKeys(val, fullKey);
          keys = keys.concat(nested);
        } else {
          keys.push(fullKey);
        }
      });
      return keys;
    },

    /**
     * JSON icerisinde nokta notasyonlu yolu cozer.
     * Desteklenen formatlar:
     *   "VBELN"           → obj.VBELN veya obj[0].VBELN (root array)
     *   "HEADER.VBELN"    → obj.HEADER.VBELN
     *   "ITEMS[].MATNR"   → obj.ITEMS[0].MATNR (ilk eleman)
     *   "0.LGORT"         → obj[0].LGORT (indexed - geriye uyumlu)
     */
    _resolveJsonPath: function (obj, path) {
      if (!obj || !path) return undefined;
      // [] → [0] (onizleme icin ilk array elemani kullanilir)
      var resolved = path.replace(/\[\]/g, "[0]");
      var parts = resolved.split(".");
      var current = obj;

      for (var i = 0; i < parts.length; i++) {
        if (current === undefined || current === null) return undefined;
        var part = parts[i];

        // Bracket notasyonu: "ITEMS[0]" veya "[0]"
        var bracketMatch = part.match(/^(.*)\[(\d+)\]$/);
        if (bracketMatch) {
          var key = bracketMatch[1];
          var idx = parseInt(bracketMatch[2], 10);
          if (key) {
            current = current[key];
          }
          if (Array.isArray(current)) {
            current = current[idx];
          } else {
            return undefined;
          }
        } else if (Array.isArray(current)) {
          // Array uzerinde property erisimi
          var numIdx = parseInt(part, 10);
          if (!isNaN(numIdx) && numIdx < current.length) {
            current = current[numIdx];
          } else if (current.length > 0) {
            current = current[0][part];
          } else {
            return undefined;
          }
        } else {
          current = current[part];
        }
      }
      return current;
    },

    /**
     * Donusum kuralini tek bir degere uygular.
     * DIRECT, LOOKUP, PREFIX:xxx, SAP_DATE destekler.
     */
    _applyTransform: function (sapVal, transform) {
      if (sapVal === undefined || sapVal === null) return "";
      if (transform === "SAP_DATE" && typeof sapVal === "string" && sapVal.length === 8) {
        return sapVal.substr(0, 4) + "-" + sapVal.substr(4, 2) + "-" + sapVal.substr(6, 2);
      }
      if (typeof transform === "string" && transform.indexOf("PREFIX:") === 0) {
        return transform.split(":")[1] + String(sapVal);
      }
      return sapVal;
    },

    /**
     * Mevcut kurallara gore 3PL JSON'u yeniden olusturur.
     * Array yapilari destekler:
     *   1) Root array SAP JSON → cikti da array (her satir donusturulur)
     *   2) Nested array (ITEMS[].xxx) → header alanlari + items dizisi
     *   3) Duz obje → duz cikti (eskisi gibi)
     */
    _rebuildThreeplJson: function (aRules, sapJson) {
      var self = this;

      // Tek elemanli array → duz obje olarak isle (kullanici [{}] yapistirma hatasi)
      if (Array.isArray(sapJson) && sapJson.length === 1) {
        sapJson = sapJson[0];
      }

      // Sadece threepl_field dolu kurallari isle
      var activeRules = aRules.filter(function (r) { return !!r.threepl_field; });

      // ── Durum 1: Root-level array (2+ eleman) ──
      if (Array.isArray(sapJson)) {
        return sapJson.map(function (item) {
          var row = {};
          activeRules.forEach(function (rule) {
            var sapVal = self._resolveJsonPath(item, rule.sap_field);
            row[rule.threepl_field] = self._applyTransform(sapVal, rule.transform);
          });
          return row;
        });
      }

      // ── Durum 2 & 3: Object – header ve item kurallarini ayir ──
      var headerRules = [];
      var itemRulesMap = {}; // arrayPath → [{sapSubField, threepl_field, transform}]

      activeRules.forEach(function (rule) {
        var sapField = rule.sap_field || "";
        // "ITEMS[].MATNR" → arrPath="ITEMS", subField="MATNR"
        var arrayMatch = sapField.match(/^(.+?)\[\]\.(.+)$/);
        if (arrayMatch) {
          var arrPath = arrayMatch[1];
          if (!itemRulesMap[arrPath]) itemRulesMap[arrPath] = [];
          itemRulesMap[arrPath].push({
            sapSubField: arrayMatch[2],
            threepl_field: rule.threepl_field,
            transform: rule.transform
          });
        } else {
          headerRules.push(rule);
        }
      });

      var result = {};

      // Header alanlari (tek deger)
      headerRules.forEach(function (rule) {
        var sapVal = self._resolveJsonPath(sapJson, rule.sap_field);
        result[rule.threepl_field] = self._applyTransform(sapVal, rule.transform);
      });

      // Item dizileri (her array path icin)
      var arrPaths = Object.keys(itemRulesMap);
      arrPaths.forEach(function (arrPath) {
        var sapArray = self._resolveJsonPath(sapJson, arrPath);
        if (!Array.isArray(sapArray)) return;

        var rules = itemRulesMap[arrPath];
        var outputKey = arrPath.toLowerCase(); // ITEMS → items

        result[outputKey] = sapArray.map(function (sapItem) {
          var row = {};
          rules.forEach(function (ir) {
            var sapVal = self._resolveJsonPath(sapItem, ir.sapSubField);
            row[ir.threepl_field] = self._applyTransform(sapVal, ir.transform);
          });
          return row;
        });
      });

      return result;
    },

    /**
     * SAP JSON textarea degistiginde profili ve DB'yi gunceller.
     */
    onSapJsonChange: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var sSapRaw = this._oModel.getProperty("/selectedFMSapJson");
      var oSapJson;
      try { oSapJson = JSON.parse(sSapRaw); } catch (_) { return; /* gecersiz JSON, kaydetme */ }
      var that = this;
      oFound.profile.sap_sample_json = oSapJson;
      this._oModel.setProperty("/fieldMappings/" + oFound.index + "/sap_sample_json", oSapJson);
      API.put("/api/config/field-mappings/" + oFound.profile.id, { sap_sample_json: oSapJson }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("msgSaved"));
          that._buildSourceTree();
        }
      });
    },

    /**
     * 3PL JSON textarea degistiginde profili ve DB'yi gunceller.
     */
    on3plJsonChange: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var s3plRaw = this._oModel.getProperty("/selectedFM3plJson");
      var o3plJson;
      try { o3plJson = JSON.parse(s3plRaw); } catch (_) { return; }
      var that = this;
      oFound.profile.threepl_sample_json = o3plJson;
      this._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", o3plJson);
      API.put("/api/config/field-mappings/" + oFound.profile.id, { threepl_sample_json: o3plJson }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("msgSaved"));
        }
      });
    },

    /**
     * SAP JSON'dan alanlari cikarip kural satiri olusturur.
     * Mevcut kurallarda zaten olan SAP alanlari atlanir.
     * 3PL tarafi bos kalir (kullanici dolduracak veya Otomatik Esle kullanacak).
     */
    onExtractSapFields: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var sSapRaw = this._oModel.getProperty("/selectedFMSapJson");
      var oSapJson;
      try { oSapJson = JSON.parse(sSapRaw); } catch (e) {
        MessageBox.error(this._getText("fmInvalidSAPJson")); return;
      }

      // Tek elemanli array → duz obje (normalize)
      if (Array.isArray(oSapJson) && oSapJson.length === 1) {
        oSapJson = oSapJson[0];
        this._oModel.setProperty("/selectedFMSapJson", JSON.stringify(oSapJson, null, 2));
      }

      var aKeys = this._flattenJsonKeys(oSapJson);
      var aExistingRules = (oFound.profile.field_rules || []).slice();
      var existingSapFields = {};
      aExistingRules.forEach(function (r) { existingSapFields[r.sap_field] = true; });

      var iAdded = 0;
      aKeys.forEach(function (key) {
        if (!existingSapFields[key]) {
          aExistingRules.push({ sap_field: key, threepl_field: "", transform: "DIRECT" });
          iAdded++;
        }
      });

      if (iAdded === 0) {
        MessageToast.show(this._getText("fmNoNewFields"));
        return;
      }

      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, {
        field_rules: aExistingRules,
        sap_sample_json: oSapJson
      }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("fmFieldsExtracted", [iAdded]));
          that._setFMRules(aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aExistingRules.length);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/sap_sample_json", oSapJson);
        }
      });
    },

    /**
     * 3PL JSON'dan alanlari cikarip kural satiri olusturur.
     * Mevcut kurallarda zaten olan 3PL alanlari atlanir.
     * SAP tarafi bos kalir.
     */
    onExtract3plFields: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var s3plRaw = this._oModel.getProperty("/selectedFM3plJson");
      var o3plJson;
      try { o3plJson = JSON.parse(s3plRaw); } catch (e) {
        MessageBox.error(this._getText("fmInvalid3PLJson")); return;
      }

      // Tek elemanli array → duz obje (normalize)
      if (Array.isArray(o3plJson) && o3plJson.length === 1) {
        o3plJson = o3plJson[0];
        this._oModel.setProperty("/selectedFM3plJson", JSON.stringify(o3plJson, null, 2));
      }

      var aKeys = this._flattenJsonKeys(o3plJson);
      var aExistingRules = (oFound.profile.field_rules || []).slice();
      var existing3plFields = {};
      aExistingRules.forEach(function (r) { if (r.threepl_field) existing3plFields[r.threepl_field] = true; });

      var iAdded = 0;
      aKeys.forEach(function (key) {
        if (!existing3plFields[key]) {
          aExistingRules.push({ sap_field: "", threepl_field: key, transform: "DIRECT" });
          iAdded++;
        }
      });

      if (iAdded === 0) {
        MessageToast.show(this._getText("fmNoNewFields"));
        return;
      }

      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, {
        field_rules: aExistingRules,
        threepl_sample_json: o3plJson
      }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("fmFieldsExtracted", [iAdded]));
          that._setFMRules(aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aExistingRules.length);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", o3plJson);
        }
      });
    },

    /**
     * Eslesmemis SAP ve 3PL alanlarini isim benzerligine gore otomatik esler.
     * Bilinen SAP alan adlarini ingilizce karsiliklariyla eslestirme sozlugu kullanir.
     */
    onAutoMap: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var that = this;

      // SAP alan alias sozlugunu API'den yukle
      API.get("/api/config/sap-field-aliases").then(function (result) {
        var sapAliases = result.data || {};

        var aRules = (oFound.profile.field_rules || []).slice();

        // Eslesmemis alanlari topla
        var unmappedSapIndices = [];
        var unmapped3plMap = {}; // lowercase 3pl field → rule index

        aRules.forEach(function (r, i) {
          if (r.sap_field && !r.threepl_field) {
            unmappedSapIndices.push(i);
          }
          if (r.threepl_field && !r.sap_field) {
            unmapped3plMap[r.threepl_field.toLowerCase()] = i;
          }
        });

        if (unmappedSapIndices.length === 0) {
          MessageToast.show(that._getText("fmAllMapped"));
          return;
        }

        var iMatched = 0;
        var usedIndices = {};

        unmappedSapIndices.forEach(function (sapIdx) {
          var baseSap = aRules[sapIdx].sap_field.split(".").pop().replace("[]", "");
          var matched3plIdx = -1;

          // 1. Tam isim eslesmesi (buyuk/kucuk harf duyarsiz)
          for (var tField in unmapped3plMap) {
            var idx = unmapped3plMap[tField];
            if (usedIndices[idx]) continue;
            if (tField === baseSap.toLowerCase()) {
              matched3plIdx = idx;
              break;
            }
          }

          // 2. Sozluk eslesmesi
          if (matched3plIdx < 0 && sapAliases[baseSap]) {
            var aliases = sapAliases[baseSap];
            for (var tField in unmapped3plMap) {
              var idx = unmapped3plMap[tField];
              if (usedIndices[idx]) continue;
              for (var a = 0; a < aliases.length; a++) {
                if (tField.indexOf(aliases[a]) >= 0) {
                  matched3plIdx = idx;
                  break;
                }
              }
              if (matched3plIdx >= 0) break;
            }
          }

          if (matched3plIdx >= 0) {
            aRules[sapIdx].threepl_field = aRules[matched3plIdx].threepl_field;
            aRules[matched3plIdx] = null;
            usedIndices[matched3plIdx] = true;
            iMatched++;
          }
        });

        // Null satirlari kaldir
        aRules = aRules.filter(function (r) { return r !== null; });

        if (iMatched === 0) {
          MessageToast.show(that._getText("fmNoAutoMatch"));
          return;
        }

        var new3plJson = that._rebuildThreeplJson(aRules, oFound.profile.sap_sample_json || {});
        API.put("/api/config/field-mappings/" + oFound.profile.id, {
          field_rules: aRules,
          threepl_sample_json: new3plJson
        }).then(function (putResult) {
          if (putResult.data && !Array.isArray(putResult.data)) {
            MessageToast.show(that._getText("fmAutoMapped", [iMatched]));
            that._setFMRules(aRules);
            that._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
            that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aRules);
            that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aRules.length);
            that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", new3plJson);
          }
        });
      });
    },

    /**
     * Guvenlik profili secim degisikligi - profili kaydet.
     */
    onFMSecurityChange: function (oEvent) {
      var sKey = oEvent.getSource().getSelectedKey();
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, { security_profile_id: sKey }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/security_profile_id", sKey);
          MessageToast.show(that._getText("msgSaved"));
        }
      });
    },

    /* ═══════════════════════════════════════════
       HTTP Başlıkları (Headers) CRUD – Profil içi
       ═══════════════════════════════════════════ */

    _openHeaderDialog: function (oExisting, iIndex) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("fmEditHeader") : this._getText("fmAddHeader");

      var oKey = new Input({ value: bEdit ? oExisting.key : "", placeholder: "Content-Type" });
      var oValue = new Input({ value: bEdit ? oExisting.value : "", placeholder: "application/json" });

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        content: [
          new Label({ text: this._getText("fmHeaderKey"), required: true }), oKey,
          new Label({ text: this._getText("fmHeaderValue"), required: true }), oValue
        ]
      });

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "450px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var oHeader = {
              key: oKey.getValue().trim(),
              value: oValue.getValue().trim()
            };
            if (!oHeader.key || !oHeader.value) {
              MessageBox.error(that._getText("msgRequiredFields")); return;
            }

            var oFound = that._getSelectedFMProfile();
            if (!oFound) return;
            var aHeaders = (oFound.profile.headers || []).slice();
            if (bEdit) {
              aHeaders[iIndex] = oHeader;
            } else {
              aHeaders.push(oHeader);
            }

            API.put("/api/config/field-mappings/" + oFound.profile.id, { headers: aHeaders }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._oModel.setProperty("/selectedFMHeaders", aHeaders);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/headers", aHeaders);
                oDialog.close();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onAddHeader: function () {
      if (!this._oModel.getProperty("/selectedFM")) return;
      this._openHeaderDialog(null, -1);
    },

    onEditHeader: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oHeader = oCtx.getObject();
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);
      this._openHeaderDialog(oHeader, iIndex);
    },

    onDeleteHeader: function (oEvent) {
      var that = this;
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);

      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            var oFound = that._getSelectedFMProfile();
            if (!oFound) return;
            var aHeaders = (oFound.profile.headers || []).slice();
            aHeaders.splice(iIndex, 1);

            API.put("/api/config/field-mappings/" + oFound.profile.id, { headers: aHeaders }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgDeleted"));
                that._oModel.setProperty("/selectedFMHeaders", aHeaders);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/headers", aHeaders);
              }
            });
          }
        }
      });
    },

    /* ═══════════════════════════════════════════
       Çıktı Önizleme (Output Preview)
       ═══════════════════════════════════════════ */

    /**
     * SAP ornek JSON'una kurallar uygulanarak 3PL cikti JSON'unu,
     * HTTP basliklarini ve guvenlik bilgisini onizleme panelinde gosterir.
     */
    onPreviewOutput: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var oProfile = oFound.profile;

      // 1. Kurallari uygulayarak cikti JSON olustur
      var sapJson = oProfile.sap_sample_json || {};
      var outputObj = this._rebuildThreeplJson(oProfile.field_rules || [], sapJson);
      this._oModel.setProperty("/outputJson", JSON.stringify(outputObj, null, 2));

      // 2. HTTP basliklarini goster
      var aHeaders = oProfile.headers || [];
      var headerObj = {};
      aHeaders.forEach(function (h) { headerObj[h.key] = h.value; });
      this._oModel.setProperty("/outputHeaders", JSON.stringify(headerObj, null, 2));

      // 3. Guvenlik bilgisini goster
      var sSecId = oProfile.security_profile_id;
      if (sSecId) {
        var aSec = this._oModel.getProperty("/securityProfiles") || [];
        var oSec = null;
        for (var i = 0; i < aSec.length; i++) {
          if (aSec[i].id === sSecId) { oSec = aSec[i]; break; }
        }
        if (oSec) {
          var secInfo = { auth_type: oSec.auth_type, environment: oSec.environment };
          if (oSec.auth_type === "OAUTH2") {
            secInfo.token_url = (oSec.config || {}).token_url;
            secInfo.scope = (oSec.config || {}).scope;
          } else if (oSec.auth_type === "API_KEY") {
            secInfo.header_name = (oSec.config || {}).header_name;
            secInfo.api_key = (oSec.config || {}).api_key;
          } else if (oSec.auth_type === "BASIC") {
            secInfo.username = (oSec.config || {}).username;
            secInfo.password = (oSec.config || {}).password;
          } else if (oSec.auth_type === "BEARER") {
            secInfo.token = (oSec.config || {}).token;
          }
          this._oModel.setProperty("/outputSecurity", JSON.stringify(secInfo, null, 2));
        } else {
          this._oModel.setProperty("/outputSecurity", "{}");
        }
      } else {
        this._oModel.setProperty("/outputSecurity", this._getText("fmNoSecurity"));
      }
    },

    /* ═══════════════════════════════════════════
       Entegrasyon – Kaynak/Hedef API + Guvenlik + Test
       ═══════════════════════════════════════════ */

    /**
     * Surec tipine gore tekil kaynak API yolu olusturur.
     * Ornek: /api/inbound/gi/abc-log, /api/inbound/sub-gi/xyz-depo
     */
    _generateSourceApiPath: function (oProfile) {
      var sProcess = (oProfile.process_type || "unknown").toLowerCase().replace(/_/g, "-");
      var sCompany = (oProfile.company_code || "default").toLowerCase().replace(/_/g, "-");
      var sDir = oProfile.direction === "3PL_TO_SAP" ? "3pl-to-sap" : "sap-to-3pl";
      var sBase = "/api/inbound/" + sProcess + "/" + sCompany;
      // Benzersizlik kontrolu: ayni path baskasinda varsa suffix ekle
      var aAll = this._oModel.getProperty("/fieldMappings") || [];
      var sCandidate = sBase;
      var iSuffix = 2;
      var sCurrentId = oProfile.id;
      while (aAll.some(function (fm) { return fm.id !== sCurrentId && fm.source_api_endpoint === sCandidate; })) {
        sCandidate = sBase + "-" + iSuffix;
        iSuffix++;
      }
      return sCandidate;
    },

    onCopySourceApi: function () {
      var sUrl = this._oModel.getProperty("/selectedFMSourceApi") || "";
      if (!sUrl) return;
      // Tam URL olustur: window.location.origin + path
      var sFullUrl = window.location.origin.replace(/:\d+$/, ":3000") + sUrl;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(sFullUrl);
      }
      MessageToast.show(this._getText("fmUrlCopied") + "\n" + sFullUrl);
    },

    onFMSourceSecurityChange: function (oEvent) {
      var sKey = oEvent.getSource().getSelectedKey();
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, { source_security_profile_id: sKey }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/source_security_profile_id", sKey);
          MessageToast.show(that._getText("msgSaved"));
        }
      });
    },

    onFMMethodChange: function (oEvent) {
      var sKey = oEvent.getSource().getSelectedKey();
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, { http_method: sKey }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/http_method", sKey);
          MessageToast.show(that._getText("msgSaved"));
        }
      });
    },

    onFMApiEndpointChange: function (oEvent) {
      var sVal = oEvent.getSource().getValue().trim();
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, { api_endpoint: sVal }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/api_endpoint", sVal);
          MessageToast.show(that._getText("msgSaved"));
        }
      });
    },

    onTestIntegration: function () {
      var that = this;
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var oProfile = oFound.profile;

      var sEndpoint = this._oModel.getProperty("/selectedFMApiEndpoint");
      var sMethod = this._oModel.getProperty("/selectedFMMethod");
      if (!sEndpoint) {
        MessageBox.error(this._getText("msgRequiredFields"));
        return;
      }

      // Test input JSON'u oku
      var sInputRaw = this._oModel.getProperty("/testInputJson");
      if (!sInputRaw || !sInputRaw.trim()) {
        // Eger bos ise, output preview JSON'u kullan
        this.onPreviewOutput();
        sInputRaw = this._oModel.getProperty("/outputJson") || "{}";
        this._oModel.setProperty("/testInputJson", sInputRaw);
      }

      var oInputObj;
      try { oInputObj = JSON.parse(sInputRaw); } catch (e) {
        MessageBox.error(this._getText("fmInvalidSAPJson"));
        return;
      }

      // Header'lari hazirla (mapping'deki manuel header'lar)
      var aHeaders = (oProfile.headers || []).filter(function (h) { return h.key && h.value; });

      this._oModel.setProperty("/testStatus", this._getText("fmTestRunning"));
      this._oModel.setProperty("/testStatusState", "Information");
      this._oModel.setProperty("/testResponseJson", "");

      var tStart = Date.now();
      var sStartedAt = new Date().toISOString();

      // Backend proxy uzerinden test — CORS bypass + security profile
      API.post("/api/config/test-dispatch", {
        url: sEndpoint,
        method: sMethod,
        headers: aHeaders,
        securityProfileId: oProfile.security_profile_id || null,
        body: sMethod !== "GET" ? oInputObj : null,
        responseRules: oProfile.response_rules || []
      })
        .then(function (result) {
          var elapsed = Date.now() - tStart;
          var oDispatch = result.data || {};
          var oResponseParsed = oDispatch.responseBody;
          var sFormatted;
          try { sFormatted = JSON.stringify(oResponseParsed, null, 2); } catch (e) { sFormatted = String(oResponseParsed); }
          var sDisplay = "HTTP " + (oDispatch.statusCode || 0) + " " + (oDispatch.statusText || "") + "\n" +
            "Duration: " + (oDispatch.duration_ms || 0) + " ms\n\n" + sFormatted;
          // Response rules uygulanmışsa eşlenmiş yanıtı da göster
          if (oDispatch.transformedResponse) {
            var sMapped;
            try { sMapped = JSON.stringify(oDispatch.transformedResponse, null, 2); } catch (e2) { sMapped = String(oDispatch.transformedResponse); }
            sDisplay += "\n\n\u2500\u2500 " + that._getText("fmMappedResponse") + " \u2500\u2500\n" + sMapped;
          }
          that._oModel.setProperty("/testResponseJson", sDisplay);
          var bOk = oDispatch.ok;
          if (bOk) {
            that._oModel.setProperty("/testStatus", that._getText("fmTestSuccess", [oDispatch.duration_ms || elapsed]));
            that._oModel.setProperty("/testStatusState", "Success");
          } else {
            that._oModel.setProperty("/testStatus", that._getText("fmTestError", [(oDispatch.statusCode || 0) + " " + (oDispatch.statusText || oDispatch.error || "")]));
            that._oModel.setProperty("/testStatusState", "Error");
          }
          // Transaction log'a kaydet
          API.post("/api/transactions", {
            direction: "OUTBOUND",
            action: "OUTBOUND_" + oProfile.process_type,
            status: bOk ? "SUCCESS" : "FAILED",
            sap_function: sEndpoint,
            sap_request: oInputObj,
            sap_response: oResponseParsed,
            error_message: bOk ? null : (oDispatch.error || "HTTP " + oDispatch.statusCode),
            retry_count: 0,
            started_at: sStartedAt,
            completed_at: new Date().toISOString(),
            duration_ms: oDispatch.duration_ms || elapsed
          });
        })
        .catch(function (err) {
          var elapsed = Date.now() - tStart;
          that._oModel.setProperty("/testResponseJson", err.toString());
          that._oModel.setProperty("/testStatus", that._getText("fmTestError", [err.message || "Network error"]));
          that._oModel.setProperty("/testStatusState", "Error");
          // Hata transaction log'a kaydet
          API.post("/api/transactions", {
            direction: "OUTBOUND",
            action: "OUTBOUND_" + oProfile.process_type,
            status: "FAILED",
            sap_function: sEndpoint,
            sap_request: oInputObj,
            sap_response: null,
            error_message: err.message,
            retry_count: 0,
            started_at: sStartedAt,
            completed_at: new Date().toISOString(),
            duration_ms: elapsed
          });
        });
    },

    /* ═══════════════════════════════════════════
       Güvenlik Profilleri (Security Profiles) CRUD
       ═══════════════════════════════════════════ */

    _openSecurityDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("spEditProfile") : this._getText("spAddProfile");

      var oCompany = new Select({ selectedKey: bEdit ? oExisting.company_code : "" });
      var aWhSP = this._oModel.getProperty("/warehouses") || [];
      var seenSP = {};
      aWhSP.forEach(function (w) {
        if (w.company_code && !seenSP[w.company_code]) {
          oCompany.addItem(new Item({ key: w.company_code, text: w.company_code }));
          seenSP[w.company_code] = true;
        }
      });
      if (bEdit && oExisting.company_code && !seenSP[oExisting.company_code]) {
        oCompany.insertItem(new Item({ key: oExisting.company_code, text: oExisting.company_code }), 0);
      }
      var oAuthType = new Select({ selectedKey: bEdit ? oExisting.auth_type : "OAUTH2" });
      oAuthType.addItem(new Item({ key: "OAUTH2", text: "OAuth 2.0" }));
      oAuthType.addItem(new Item({ key: "API_KEY", text: "API Key" }));
      oAuthType.addItem(new Item({ key: "BASIC", text: "Basic Auth" }));
      oAuthType.addItem(new Item({ key: "BEARER", text: "Bearer Token" }));
      var oEnvironment = new Select({ selectedKey: bEdit ? oExisting.environment : "QAS" });
      oEnvironment.addItem(new Item({ key: "PROD", text: "PROD" }));
      oEnvironment.addItem(new Item({ key: "QAS", text: "QAS" }));
      oEnvironment.addItem(new Item({ key: "DEV", text: "DEV" }));

      var oConfig = bEdit ? (oExisting.config || {}) : {};

      // OAuth2 fields
      var oClientId = new Input({ value: oConfig.client_id || "", placeholder: "client_id" });
      var oClientSecret = new Input({ value: oConfig.client_secret || "", placeholder: "***", type: "Password" });
      var oTokenUrl = new Input({ value: oConfig.token_url || "", placeholder: "https://auth.example.com/token" });
      var oScope = new Input({ value: oConfig.scope || "", placeholder: "wms.read wms.write" });

      // API Key fields
      var oApiKey = new Input({ value: oConfig.api_key || "", placeholder: "***", type: "Password" });
      var oHeaderName = new Input({ value: oConfig.header_name || "X-API-Key", placeholder: "X-API-Key" });

      // Basic Auth fields
      var oUsername = new Input({ value: oConfig.username || "" });
      var oPassword = new Input({ value: oConfig.password || "", type: "Password" });

      // Bearer Token field
      var oBearerToken = new Input({ value: oConfig.token || "", placeholder: "eyJhbGciOiJSUzI1NiIs...", type: "Password" });

      var oActive = new Select({ selectedKey: bEdit ? String(oExisting.is_active) : "true" });
      oActive.addItem(new Item({ key: "true", text: this._getText("cfgActiveYes") }));
      oActive.addItem(new Item({ key: "false", text: this._getText("cfgActiveNo") }));

      // Labels for dynamic visibility
      var oLblClientId = new Label({ text: this._getText("spClientId") });
      var oLblClientSecret = new Label({ text: this._getText("spClientSecret") });
      var oLblTokenUrl = new Label({ text: this._getText("spTokenUrl") });
      var oLblScope = new Label({ text: this._getText("spScope") });
      var oLblApiKey = new Label({ text: this._getText("spApiKey") });
      var oLblHeaderName = new Label({ text: this._getText("spHeaderName") });
      var oLblUsername = new Label({ text: this._getText("spUsername") });
      var oLblPassword = new Label({ text: this._getText("spPassword") });
      var oLblBearerToken = new Label({ text: this._getText("spBearerToken") });

      var fnToggle = function () {
        var sType = oAuthType.getSelectedKey();
        var bOAuth = sType === "OAUTH2";
        var bApiKey = sType === "API_KEY";
        var bBasic = sType === "BASIC";
        var bBearer = sType === "BEARER";
        oLblClientId.setVisible(bOAuth); oClientId.setVisible(bOAuth);
        oLblClientSecret.setVisible(bOAuth); oClientSecret.setVisible(bOAuth);
        oLblTokenUrl.setVisible(bOAuth); oTokenUrl.setVisible(bOAuth);
        oLblScope.setVisible(bOAuth); oScope.setVisible(bOAuth);
        oLblApiKey.setVisible(bApiKey); oApiKey.setVisible(bApiKey);
        oLblHeaderName.setVisible(bApiKey); oHeaderName.setVisible(bApiKey);
        oLblUsername.setVisible(bBasic); oUsername.setVisible(bBasic);
        oLblPassword.setVisible(bBasic); oPassword.setVisible(bBasic);
        oLblBearerToken.setVisible(bBearer); oBearerToken.setVisible(bBearer);
      };
      oAuthType.attachChange(fnToggle);

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0,
        columnsXL: 1, columnsL: 1, columnsM: 1,
        content: [
          new Label({ text: this._getText("spCompanyCode"), required: true }), oCompany,
          new Label({ text: this._getText("spAuthType"), required: true }), oAuthType,
          new Label({ text: this._getText("spEnvironment"), required: true }), oEnvironment,
          oLblClientId, oClientId,
          oLblClientSecret, oClientSecret,
          oLblTokenUrl, oTokenUrl,
          oLblScope, oScope,
          oLblApiKey, oApiKey,
          oLblHeaderName, oHeaderName,
          oLblUsername, oUsername,
          oLblPassword, oPassword,
          oLblBearerToken, oBearerToken,
          new Label({ text: this._getText("cfgActive") }), oActive
        ]
      });

      // Initial toggle
      fnToggle();

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "550px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var sType = oAuthType.getSelectedKey();
            var oConfigPayload = {};
            if (sType === "OAUTH2") {
              oConfigPayload = {
                client_id: oClientId.getValue().trim(),
                client_secret: oClientSecret.getValue().trim(),
                token_url: oTokenUrl.getValue().trim(),
                scope: oScope.getValue().trim()
              };
            } else if (sType === "API_KEY") {
              oConfigPayload = {
                api_key: oApiKey.getValue().trim(),
                header_name: oHeaderName.getValue().trim()
              };
            } else if (sType === "BASIC") {
              oConfigPayload = {
                username: oUsername.getValue().trim(),
                password: oPassword.getValue().trim()
              };
            } else if (sType === "BEARER") {
              oConfigPayload = {
                token: oBearerToken.getValue().trim()
              };
            }
            var oPayload = {
              company_code: oCompany.getSelectedKey(),
              auth_type: sType,
              environment: oEnvironment.getSelectedKey(),
              config: oConfigPayload,
              is_active: oActive.getSelectedKey() === "true"
            };
            if (!oPayload.company_code) {
              MessageBox.error(that._getText("msgRequiredFields"));
              return;
            }
            var pReq = bEdit
              ? API.put("/api/config/security-profiles/" + oExisting.id, oPayload)
              : API.post("/api/config/security-profiles", oPayload);
            pReq.then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._loadData();
                oDialog.close();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    /* ═══════════════════════════════════════════
       Yanıt Eşleme (Response Rules) CRUD
       ═══════════════════════════════════════════ */

    _saveResponseRulesAndRefresh: function (aRules) {
      var that = this;
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var cleanRules = aRules.map(function (r) {
        return { source_field: r.source_field, target_field: r.target_field, transform: r.transform };
      });

      // Response preview hesapla
      var sResponseSample = this._oModel.getProperty("/selectedFMResponseSampleJson");
      var oResponseSample;
      try { oResponseSample = JSON.parse(sResponseSample); } catch (e) { oResponseSample = {}; }
      var oPreview = this._rebuildResponsePreview(cleanRules, oResponseSample);

      API.put("/api/config/field-mappings/" + oFound.profile.id, {
        response_rules: cleanRules
      }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          that._oModel.setProperty("/selectedFMResponseRules", cleanRules);
          that._oModel.setProperty("/responsePreviewJson", JSON.stringify(oPreview, null, 2));
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/response_rules", cleanRules);
        }
      });
    },

    _rebuildResponsePreview: function (aRules, oResponseSample) {
      if (!oResponseSample || typeof oResponseSample !== "object") return {};
      var validRules = aRules.filter(function (r) { return r.source_field && r.target_field; });
      if (validRules.length === 0) return {};

      var self = this;
      var output = {};
      validRules.forEach(function (rule) {
        var val = self._resolveJsonPath(oResponseSample, rule.source_field);
        if (val !== undefined) {
          output[rule.target_field] = self._applyTransform(val, rule.transform);
        }
      });
      return output;
    },

    onAddResponseRule: function () {
      var that = this;
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var oSourceInput = new Input({ placeholder: "shipment_id" });
      var oTargetInput = new Input({ placeholder: "referans_no" });
      var oTransformSelect = new Select({});
      oTransformSelect.addItem(new Item({ key: "DIRECT", text: "DIRECT" }));
      oTransformSelect.addItem(new Item({ key: "LOOKUP", text: "LOOKUP" }));
      oTransformSelect.addItem(new Item({ key: "PREFIX", text: "PREFIX" }));
      oTransformSelect.addItem(new Item({ key: "SAP_DATE", text: "SAP_DATE" }));

      var oDialog = new Dialog({
        title: this._getText("fmAddResponseRule"),
        contentWidth: "400px",
        content: [
          new SimpleForm({
            editable: true,
            layout: "ResponsiveGridLayout",
            labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
            content: [
              new Label({ text: this._getText("fmSourceField"), required: true }), oSourceInput,
              new Label({ text: this._getText("fmTargetField"), required: true }), oTargetInput,
              new Label({ text: this._getText("fmTransform") }), oTransformSelect
            ]
          })
        ],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var sSource = oSourceInput.getValue().trim();
            var sTarget = oTargetInput.getValue().trim();
            if (!sSource || !sTarget) {
              MessageBox.error(that._getText("msgRequiredFields"));
              return;
            }
            var aRules = (that._oModel.getProperty("/selectedFMResponseRules") || []).slice();
            aRules.push({ source_field: sSource, target_field: sTarget, transform: oTransformSelect.getSelectedKey() });
            that._saveResponseRulesAndRefresh(aRules);
            oDialog.close();
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.open();
    },

    onDeleteResponseRule: function (oEvent) {
      var that = this;
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      if (!oCtx) return;
      var sPath = oCtx.getPath();
      // Path: /selectedFMResponseRules/0 → index = 0
      var iIndex = parseInt(sPath.split("/").pop(), 10);
      if (isNaN(iIndex)) return;

      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            var aRules = (that._oModel.getProperty("/selectedFMResponseRules") || []).slice();
            aRules.splice(iIndex, 1);
            that._saveResponseRulesAndRefresh(aRules);
          }
        }
      });
    },

    onResponseTargetChange: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      if (!oCtx) return;
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);
      if (isNaN(iIndex)) return;

      var sNewTarget = oEvent.getParameter("value").trim();
      var aRules = (this._oModel.getProperty("/selectedFMResponseRules") || []).slice();
      if (aRules[iIndex]) {
        aRules[iIndex].target_field = sNewTarget;
        this._saveResponseRulesAndRefresh(aRules);
      }
    },

    onResponseTransformChange: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      if (!oCtx) return;
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);
      if (isNaN(iIndex)) return;

      var sNewTransform = oEvent.getParameter("selectedItem").getKey();
      var aRules = (this._oModel.getProperty("/selectedFMResponseRules") || []).slice();
      if (aRules[iIndex]) {
        aRules[iIndex].transform = sNewTransform;
        this._saveResponseRulesAndRefresh(aRules);
      }
    },

    onExtractResponseFields: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var sResponseRaw = this._oModel.getProperty("/selectedFMResponseSampleJson");
      var oResponseJson;
      try { oResponseJson = JSON.parse(sResponseRaw); } catch (e) {
        MessageBox.error(this._getText("fmInvalidSAPJson")); return;
      }

      var aKeys = this._flattenJsonKeys(oResponseJson);
      var aExistingRules = (this._oModel.getProperty("/selectedFMResponseRules") || []).slice();
      var existingSourceFields = {};
      aExistingRules.forEach(function (r) { existingSourceFields[r.source_field] = true; });

      var iAdded = 0;
      aKeys.forEach(function (key) {
        if (!existingSourceFields[key]) {
          aExistingRules.push({ source_field: key, target_field: "", transform: "DIRECT" });
          iAdded++;
        }
      });

      if (iAdded === 0) {
        MessageToast.show(this._getText("fmNoNewFields"));
        return;
      }

      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, {
        response_rules: aExistingRules,
        threepl_response_sample_json: oResponseJson
      }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("fmFieldsExtracted", [iAdded]));
          that._oModel.setProperty("/selectedFMResponseRules", aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/response_rules", aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_response_sample_json", oResponseJson);
        }
      });
    },

    onAutoMapResponse: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var aRules = (this._oModel.getProperty("/selectedFMResponseRules") || []).slice();
      var iMatched = 0;

      // Basit auto-map: source_field'daki son segment'i target_field olarak ata (boş olanlar için)
      aRules.forEach(function (rule) {
        if (rule.source_field && !rule.target_field) {
          // "data.shipment_id" → "shipment_id", "tracking_no" → "tracking_no"
          var parts = rule.source_field.split(".");
          rule.target_field = parts[parts.length - 1].replace(/\[\]/g, "");
          iMatched++;
        }
      });

      if (iMatched === 0) {
        MessageToast.show(this._getText("fmNoNewFields"));
        return;
      }

      this._saveResponseRulesAndRefresh(aRules);
      MessageToast.show(this._getText("fmAutoMapped", [iMatched]));
    },

    onAddSecurity: function () { this._openSecurityDialog(null); },

    onEditSecurity: function (oEvent) {
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      this._openSecurityDialog(oItem);
    },

    onDeleteSecurity: function (oEvent) {
      var that = this;
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            API.del("/api/config/security-profiles/" + oItem.id).then(function (result) {
              if (result.success) {
                MessageToast.show(that._getText("msgDeleted"));
                that._loadData();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }
      });
    }
  });
});
