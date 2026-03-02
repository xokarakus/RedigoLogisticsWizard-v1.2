sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "com/redigo/logistics/cockpit/util/API",
  "./config/WarehouseMixin",
  "./config/ProcessMixin",
  "./config/FieldMappingMixin",
  "./config/FlowDesignerMixin",
  "./config/SecurityMixin"
], function (Controller, JSONModel, MessageToast, API,
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
      }
    }
  );

  return Controller.extend("com.redigo.logistics.cockpit.controller.Configuration", oProto);
});
