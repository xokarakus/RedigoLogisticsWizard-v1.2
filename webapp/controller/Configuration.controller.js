sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageBox, MessageToast, API) {
  "use strict";

  var DEMO_WAREHOUSES = [
    { id: "w1", code: "WH-IST-01", name: "Istanbul Anadolu Depo", sap_plant: "1000", sap_stor_loc: "0001", wms_code: "CEVA-IST", wms_provider: "CEVA", is_active: true },
    { id: "w2", code: "WH-ANK-01", name: "Ankara Merkez Depo", sap_plant: "2000", sap_stor_loc: "0001", wms_code: "DHL-ANK", wms_provider: "DHL", is_active: true },
    { id: "w3", code: "WH-IZM-01", name: "Izmir Serbest Bolge", sap_plant: "3000", sap_stor_loc: "0002", wms_code: "HOPI-IZM", wms_provider: "HOPI", is_active: true },
    { id: "w4", code: "WH-BRS-01", name: "Bursa Uretim Yani", sap_plant: "4000", sap_stor_loc: "0001", wms_code: "CEVA-BRS", wms_provider: "CEVA", is_active: false }
  ];

  var DEMO_MAPPINGS = [
    { id: "m1", warehouse_code: "WH-IST-01", wms_action_code: "SCRAP", sap_movement_type: "551", sap_plant: null, sap_stor_loc: null, sap_to_plant: null, sap_to_stor_loc: null, description: "Hurda cikisi", is_active: true },
    { id: "m2", warehouse_code: "WH-IST-01", wms_action_code: "DAMAGED", sap_movement_type: "344", sap_plant: null, sap_stor_loc: null, sap_to_plant: null, sap_to_stor_loc: null, description: "Hasarli stok blokaj", is_active: true },
    { id: "m3", warehouse_code: "WH-IST-01", wms_action_code: "TRANSFER_SLOC", sap_movement_type: "311", sap_plant: null, sap_stor_loc: null, sap_to_plant: null, sap_to_stor_loc: "0002", description: "Depo yeri transferi", is_active: true },
    { id: "m4", warehouse_code: "WH-ANK-01", wms_action_code: "SCRAP", sap_movement_type: "551", sap_plant: null, sap_stor_loc: null, sap_to_plant: null, sap_to_stor_loc: null, description: "Hurda cikisi", is_active: true },
    { id: "m5", warehouse_code: "WH-ANK-01", wms_action_code: "TRANSFER_PLANT", sap_movement_type: "301", sap_plant: null, sap_stor_loc: null, sap_to_plant: "3000", sap_to_stor_loc: "0001", description: "Tesisler arasi transfer", is_active: true }
  ];

  return Controller.extend("com.redigo.logistics.cockpit.controller.Configuration", {
    onInit: function () {
      this._oModel = new JSONModel({ warehouses: [], mappings: [], warehouseCount: 0, mappingCount: 0 });
      this.getView().setModel(this._oModel, "cfg");
      this._loadData();
    },
    _loadData: function () {
      var that = this;
      API.get("/api/config/warehouses").then(function (result) {
        var aData = (result.data && result.data.length) ? result.data : DEMO_WAREHOUSES;
        that._oModel.setProperty("/warehouses", aData);
        that._oModel.setProperty("/warehouseCount", aData.length);
      });
      API.get("/api/inventory/mappings").then(function (result) {
        var aData = (result.data && result.data.length) ? result.data : DEMO_MAPPINGS;
        that._oModel.setProperty("/mappings", aData);
        that._oModel.setProperty("/mappingCount", aData.length);
      });
    },
    onAddWarehouse: function () { MessageToast.show("Depo ekleme - yakinda"); },
    onEditWarehouse: function () { MessageToast.show("Depo duzenleme - yakinda"); },
    onArchiveWarehouse: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var sCode = oCtx.getProperty("code");
      var iIdx = oCtx.getPath().split("/").pop();
      var that = this;
      MessageBox.warning("'" + sCode + "' deposunu arsivlemek istediginizden emin misiniz? Demir Kural: silinemez, sadece devre disi birakilir.", {
        actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) { that._oModel.setProperty("/warehouses/" + iIdx + "/is_active", false); MessageToast.show("Depo arsivlendi"); }
        }
      });
    },
    onAddMapping: function () { MessageToast.show("Eslestirme ekleme - yakinda"); },
    onEditMapping: function () { MessageToast.show("Eslestirme duzenleme - yakinda"); },
    onArchiveMapping: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var iIdx = oCtx.getPath().split("/").pop();
      var that = this;
      MessageBox.warning("Bu eslestirmeyi arsivlemek istiyor musunuz? Demir Kural: silinemez.", {
        actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) { that._oModel.setProperty("/mappings/" + iIdx + "/is_active", false); MessageToast.show("Eslestirme arsivlendi"); }
        }
      });
    }
  });
});
