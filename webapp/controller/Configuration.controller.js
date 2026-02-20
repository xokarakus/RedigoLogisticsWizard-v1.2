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
        selectedType: null, selectedTypeName: "", selectedTypeSteps: []
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
      API.get("/api/inventory/mappings").then(function (result) {
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
    },

    /* ═══ Warehouses (coming soon) ═══ */
    onAddWarehouse: function () { MessageToast.show(this._getText("msgAddWarehouseCS")); },
    onEditWarehouse: function () { MessageToast.show(this._getText("msgEditWarehouseCS")); },

    /* ═══ Mappings (coming soon) ═══ */
    onAddMapping: function () { MessageToast.show(this._getText("msgAddMappingCS")); },
    onEditMapping: function () { MessageToast.show(this._getText("msgEditMappingCS")); },

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
          new Label({ text: this._getText("cfgStepApi") }), oApi
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
              api: oApi.getValue().trim()
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
    }
  });
});
