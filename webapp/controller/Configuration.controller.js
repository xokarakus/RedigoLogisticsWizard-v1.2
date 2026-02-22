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
  "sap/ui/core/Item",
  "sap/ui/layout/form/SimpleForm",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, Label, Input, Select, Item, SimpleForm, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.Configuration", {
    onInit: function () {
      this._oModel = new JSONModel({
        warehouses: [], mappings: [], processConfigs: [], processTypes: [],
        warehouseCount: 0, mappingCount: 0, processConfigCount: 0, processTypeCount: 0,
        selectedType: null, selectedTypeName: "", selectedTypeSteps: [],
        fieldMappings: [], fieldMappingCount: 0,
        selectedFM: null, selectedFMTitle: "", selectedFMSapJson: "", selectedFM3plJson: "", selectedFMRules: [],
        selectedFMHeaders: [], selectedFMSecurityId: "", securityForCompany: [],
        outputHeaders: "", outputJson: "", outputSecurity: "",
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
      API.get("/api/config/warehouses").then(function (result) {
        var aData = result.data || [];
        that._oModel.setProperty("/warehouses", aData);
        that._oModel.setProperty("/warehouseCount", aData.length);
      });
      API.get("/api/config/mappings").then(function (result) {
        var aData = result.data || [];
        that._oModel.setProperty("/mappings", aData);
        that._oModel.setProperty("/mappingCount", aData.length);
      });
      API.get("/api/config/process-configs").then(function (result) {
        var aData = result.data || [];
        that._oModel.setProperty("/processConfigs", aData);
        that._oModel.setProperty("/processConfigCount", aData.length);
      });
      API.get("/api/config/process-types").then(function (result) {
        var aData = result.data || [];
        aData.forEach(function (t) { t.stepCount = (t.steps || []).length; });
        that._oModel.setProperty("/processTypes", aData);
        that._oModel.setProperty("/processTypeCount", aData.length);
      });
      API.get("/api/config/field-mappings").then(function (result) {
        var aData = result.data || [];
        aData.forEach(function (fm) { fm.ruleCount = (fm.field_rules || []).length; });
        that._oModel.setProperty("/fieldMappings", aData);
        that._oModel.setProperty("/fieldMappingCount", aData.length);
      });
      API.get("/api/config/security-profiles").then(function (result) {
        var aData = result.data || [];
        that._oModel.setProperty("/securityProfiles", aData);
        that._oModel.setProperty("/securityCount", aData.length);
      });
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
      var oProvider = new Input({ value: bEdit ? oExisting.wms_provider : "", placeholder: "Redigo WMS" });
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
          new Label({ text: this._getText("cfgProvider") }), oProvider,
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
              wms_provider: oProvider.getValue().trim(),
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
       Hareket Eslemeleri (Mappings) CRUD
       ═══════════════════════════════════════════ */

    _openMappingDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("cfgEditMapping") : this._getText("cfgAddMapping");

      var oWarehouse = new Select({ selectedKey: bEdit ? oExisting.warehouse_code : "" });
      var aWarehouses = this._oModel.getProperty("/warehouses") || [];
      aWarehouses.forEach(function (w) {
        oWarehouse.addItem(new Item({ key: w.code, text: w.code + " \u2013 " + w.name }));
      });

      var oAction = new Input({ value: bEdit ? oExisting.wms_action_code : "", placeholder: "PICK_COMPLETE" });
      var oMvtType = new Input({ value: bEdit ? oExisting.sap_movement_type : "", placeholder: "601" });
      var oPlant = new Input({ value: bEdit ? oExisting.sap_plant : "", placeholder: "1000" });
      var oSLoc = new Input({ value: bEdit ? oExisting.sap_stor_loc : "", placeholder: "0001" });
      var oToPlant = new Input({ value: bEdit ? oExisting.sap_to_plant : "" });
      var oToSLoc = new Input({ value: bEdit ? oExisting.sap_to_stor_loc : "" });
      var oDesc = new Input({ value: bEdit ? oExisting.description : "" });
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
          new Label({ text: this._getText("invWarehouse"), required: true }), oWarehouse,
          new Label({ text: this._getText("cfgWMSAction"), required: true }), oAction,
          new Label({ text: this._getText("cfgSAPMvtType"), required: true }), oMvtType,
          new Label({ text: this._getText("cfgPlant") }), oPlant,
          new Label({ text: this._getText("cfgStorLoc") }), oSLoc,
          new Label({ text: this._getText("cfgToPlant") }), oToPlant,
          new Label({ text: this._getText("cfgToSLoc") }), oToSLoc,
          new Label({ text: this._getText("cfgDescription") }), oDesc,
          new Label({ text: this._getText("cfgActive") }), oActive
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
            var oPayload = {
              warehouse_code: oWarehouse.getSelectedKey(),
              wms_action_code: oAction.getValue().trim(),
              sap_movement_type: oMvtType.getValue().trim(),
              sap_plant: oPlant.getValue().trim(),
              sap_stor_loc: oSLoc.getValue().trim(),
              sap_to_plant: oToPlant.getValue().trim(),
              sap_to_stor_loc: oToSLoc.getValue().trim(),
              description: oDesc.getValue().trim(),
              is_active: oActive.getSelectedKey() === "true"
            };
            if (!oPayload.warehouse_code || !oPayload.wms_action_code || !oPayload.sap_movement_type) {
              MessageBox.error(that._getText("msgRequiredFields"));
              return;
            }
            var pReq = bEdit
              ? API.put("/api/config/mappings/" + oExisting.id, oPayload)
              : API.post("/api/config/mappings", oPayload);
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

    onAddMapping: function () { this._openMappingDialog(null); },

    onEditMapping: function (oEvent) {
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      this._openMappingDialog(oItem);
    },

    /* ═══════════════════════════════════════════
       Süreç Uyarlamaları (Process Configs) CRUD
       ═══════════════════════════════════════════ */

    _openProcessConfigDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("cfgEditProcessConfig") : this._getText("cfgAddProcessConfig");

      var oPlant = new Input({ value: bEdit ? oExisting.plant_code : "", placeholder: "1000" });
      var oWarehouse = new Input({ value: bEdit ? oExisting.warehouse_code : "", placeholder: "WH-IST-01" });
      var oDelType = new Input({ value: bEdit ? oExisting.delivery_type : "", placeholder: "LF" });
      var oDelTypeDesc = new Input({ value: bEdit ? oExisting.delivery_type_desc : "" });

      var aTypes = this._oModel.getProperty("/processTypes") || [];
      var oProcessType = new Select({ selectedKey: bEdit ? oExisting.process_type : "" });
      aTypes.forEach(function (t) {
        oProcessType.addItem(new Item({ key: t.code, text: t.code + " - " + t.name }));
      });

      var oMvtType = new Input({ value: bEdit ? oExisting.mvt_type : "", placeholder: "601" });
      var oCompanyName = new Input({ value: bEdit ? oExisting.company_name : "" });
      var oCompanyCode = new Input({ value: bEdit ? oExisting.company_code : "" });
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
          new Label({ text: this._getText("cfgCompany") }), oCompanyName,
          new Label({ text: this._getText("cfgCompanyCode") }), oCompanyCode,
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
              warehouse_code: oWarehouse.getValue().trim(),
              delivery_type: oDelType.getValue().trim(),
              delivery_type_desc: oDelTypeDesc.getValue().trim(),
              process_type: oProcessType.getSelectedKey(),
              mvt_type: oMvtType.getValue().trim(),
              company_name: oCompanyName.getValue().trim(),
              company_code: oCompanyCode.getValue().trim(),
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

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        content: [
          new Label({ text: this._getText("cfgTypeCode"), required: true }), oCode,
          new Label({ text: this._getText("cfgTypeName"), required: true }), oName
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
            var sCode = oCode.getValue().trim();
            var sName = oName.getValue().trim();
            if (!sCode || !sName) { MessageBox.error(that._getText("msgRequiredFields")); return; }
            var oPayload = { code: sCode, name: sName };
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

    onSelectFieldMapping: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      if (!oItem) return;
      var oProfile = oItem.getBindingContext("cfg").getObject();
      this._oModel.setProperty("/selectedFM", oProfile.id);
      this._oModel.setProperty("/selectedFMTitle", oProfile.process_type + " \u2013 " + oProfile.company_code + " \u2013 " + oProfile.description);
      this._oModel.setProperty("/selectedFMSapJson", JSON.stringify(oProfile.sap_sample_json || {}, null, 2));
      this._oModel.setProperty("/selectedFM3plJson", JSON.stringify(oProfile.threepl_sample_json || {}, null, 2));
      this._oModel.setProperty("/selectedFMRules", oProfile.field_rules || []);
      this._oModel.setProperty("/selectedFMHeaders", oProfile.headers || []);
      this._oModel.setProperty("/selectedFMSecurityId", oProfile.security_profile_id || "");
      // Reset output preview
      this._oModel.setProperty("/outputHeaders", "");
      this._oModel.setProperty("/outputJson", "");
      this._oModel.setProperty("/outputSecurity", "");
      // Filter security profiles for this company
      var aSec = this._oModel.getProperty("/securityProfiles") || [];
      var sCompany = oProfile.company_code;
      var aFiltered = [{ id: "", displayText: this._getText("fmNoSecurity") }];
      aSec.forEach(function (sp) {
        if (sp.company_code === sCompany) {
          aFiltered.push({ id: sp.id, displayText: sp.auth_type + " \u2013 " + sp.environment });
        }
      });
      this._oModel.setProperty("/securityForCompany", aFiltered);
    },

    _openFieldMappingDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("fmEditProfile") : this._getText("fmAddProfile");

      var aTypes = this._oModel.getProperty("/processTypes") || [];
      var oProcessType = new Select({ selectedKey: bEdit ? oExisting.process_type : "" });
      aTypes.forEach(function (t) {
        oProcessType.addItem(new Item({ key: t.code, text: t.code + " \u2013 " + t.name }));
      });
      var oCompany = new Input({ value: bEdit ? oExisting.company_code : "", placeholder: "ABC_LOG" });
      var oDesc = new Input({ value: bEdit ? oExisting.description : "" });
      var oSapJson = new sap.m.TextArea({ value: bEdit ? JSON.stringify(oExisting.sap_sample_json || {}, null, 2) : "{}", rows: 10, width: "100%" });
      var o3plJson = new sap.m.TextArea({ value: bEdit ? JSON.stringify(oExisting.threepl_sample_json || {}, null, 2) : "{}", rows: 10, width: "100%" });
      var oActive = new Select({ selectedKey: bEdit ? String(oExisting.is_active) : "true" });
      oActive.addItem(new Item({ key: "true", text: this._getText("cfgActiveYes") }));
      oActive.addItem(new Item({ key: "false", text: this._getText("cfgActiveNo") }));

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
          new Label({ text: this._getText("fmSAPJson") }), oSapJson,
          new Label({ text: this._getText("fm3PLJson") }), o3plJson,
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
            var sSapRaw = oSapJson.getValue().trim();
            var s3plRaw = o3plJson.getValue().trim();
            var oSapObj, o3plObj;
            try { oSapObj = JSON.parse(sSapRaw); } catch (e) {
              MessageBox.error(that._getText("fmInvalidSAPJson")); return;
            }
            try { o3plObj = JSON.parse(s3plRaw); } catch (e) {
              MessageBox.error(that._getText("fmInvalid3PLJson")); return;
            }
            var oPayload = {
              process_type: oProcessType.getSelectedKey(),
              company_code: oCompany.getValue().trim(),
              description: oDesc.getValue().trim(),
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

    _openFieldRuleDialog: function (oExisting, iIndex) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("fmEditRule") : this._getText("fmAddRule");

      var oSapField = new Input({ value: bEdit ? oExisting.sap_field : "", placeholder: "VBELN" });
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

            var new3plJson = that._rebuildThreeplJson(aRules, oFound.profile.sap_sample_json || {});
            API.put("/api/config/field-mappings/" + oFound.profile.id, { field_rules: aRules, threepl_sample_json: new3plJson }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._oModel.setProperty("/selectedFMRules", aRules);
                that._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aRules);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aRules.length);
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

    onEditFieldRule: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oRule = oCtx.getObject();
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);
      this._openFieldRuleDialog(oRule, iIndex);
    },

    onDeleteFieldRule: function (oEvent) {
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
            var aRules = (oFound.profile.field_rules || []).slice();
            aRules.splice(iIndex, 1);

            var new3plJson = that._rebuildThreeplJson(aRules, oFound.profile.sap_sample_json || {});
            API.put("/api/config/field-mappings/" + oFound.profile.id, { field_rules: aRules, threepl_sample_json: new3plJson }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgDeleted"));
                that._oModel.setProperty("/selectedFMRules", aRules);
                that._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aRules);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aRules.length);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", new3plJson);
              }
            });
          }
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
     * Mevcut kurallara gore 3PL JSON'u yeniden olusturur.
     * SAP ornek verilerinden donusum uygulayarak 3PL ciktisini hesaplar.
     * Nested path'leri (_resolveJsonPath ile) cozer.
     */
    _rebuildThreeplJson: function (aRules, sapJson) {
      var result = {};
      var self = this;
      aRules.forEach(function (rule) {
        if (!rule.threepl_field) return;
        var sapVal = self._resolveJsonPath(sapJson, rule.sap_field);
        if (sapVal === undefined) {
          result[rule.threepl_field] = "";
          return;
        }
        if (rule.transform === "SAP_DATE" && typeof sapVal === "string" && sapVal.length === 8) {
          result[rule.threepl_field] = sapVal.substr(0, 4) + "-" + sapVal.substr(4, 2) + "-" + sapVal.substr(6, 2);
        } else if (typeof rule.transform === "string" && rule.transform.indexOf("PREFIX:") === 0) {
          result[rule.threepl_field] = rule.transform.split(":")[1] + String(sapVal);
        } else {
          result[rule.threepl_field] = sapVal;
        }
      });
      return result;
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
          that._oModel.setProperty("/selectedFMRules", aExistingRules);
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
          that._oModel.setProperty("/selectedFMRules", aExistingRules);
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

      var aRules = (oFound.profile.field_rules || []).slice();

      // SAP alan adi → olasi 3PL karsiliklari sozlugu
      var sapAliases = {
        "VBELN": ["delivery", "order", "ref", "number", "shipment"],
        "MATNR": ["material", "sku", "item_code", "item", "product_code"],
        "MAKTX": ["description", "name", "product_name", "item_name"],
        "LGORT": ["location", "storage", "warehouse", "bin"],
        "WERKS": ["plant", "facility"],
        "LFIMG": ["quantity", "qty", "amount"],
        "MEINS": ["unit", "uom"],
        "KUNNR": ["customer_id", "customer", "cust"],
        "KUNNA": ["customer_name"],
        "LIFNR": ["vendor_id", "supplier_id", "vendor"],
        "LIFNA": ["vendor_name", "supplier_name"],
        "WADAT": ["delivery_date", "ship_date", "date"],
        "ERDAT": ["created_date", "create_date", "created"],
        "POSNR": ["line", "item_no", "position", "line_number"],
        "GRUND": ["reason", "reason_code"]
      };

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
        MessageToast.show(this._getText("fmAllMapped"));
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
        MessageToast.show(this._getText("fmNoAutoMatch"));
        return;
      }

      var that = this;
      var new3plJson = this._rebuildThreeplJson(aRules, oFound.profile.sap_sample_json || {});
      API.put("/api/config/field-mappings/" + oFound.profile.id, {
        field_rules: aRules,
        threepl_sample_json: new3plJson
      }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("fmAutoMapped", [iMatched]));
          that._oModel.setProperty("/selectedFMRules", aRules);
          that._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aRules.length);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", new3plJson);
        }
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
            secInfo.api_key = "***";
          } else if (oSec.auth_type === "BASIC") {
            secInfo.username = (oSec.config || {}).username;
            secInfo.password = "***";
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
       Güvenlik Profilleri (Security Profiles) CRUD
       ═══════════════════════════════════════════ */

    _openSecurityDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("spEditProfile") : this._getText("spAddProfile");

      var oCompany = new Input({ value: bEdit ? oExisting.company_code : "", placeholder: "ABC_LOG" });
      var oAuthType = new Select({ selectedKey: bEdit ? oExisting.auth_type : "OAUTH2" });
      oAuthType.addItem(new Item({ key: "OAUTH2", text: "OAuth 2.0" }));
      oAuthType.addItem(new Item({ key: "API_KEY", text: "API Key" }));
      oAuthType.addItem(new Item({ key: "BASIC", text: "Basic Auth" }));
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

      var fnToggle = function () {
        var sType = oAuthType.getSelectedKey();
        var bOAuth = sType === "OAUTH2";
        var bApiKey = sType === "API_KEY";
        var bBasic = sType === "BASIC";
        oLblClientId.setVisible(bOAuth); oClientId.setVisible(bOAuth);
        oLblClientSecret.setVisible(bOAuth); oClientSecret.setVisible(bOAuth);
        oLblTokenUrl.setVisible(bOAuth); oTokenUrl.setVisible(bOAuth);
        oLblScope.setVisible(bOAuth); oScope.setVisible(bOAuth);
        oLblApiKey.setVisible(bApiKey); oApiKey.setVisible(bApiKey);
        oLblHeaderName.setVisible(bApiKey); oHeaderName.setVisible(bApiKey);
        oLblUsername.setVisible(bBasic); oUsername.setVisible(bBasic);
        oLblPassword.setVisible(bBasic); oPassword.setVisible(bBasic);
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
            }
            var oPayload = {
              company_code: oCompany.getValue().trim(),
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
              }
            });
          }
        }
      });
    }
  });
});
