sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, API) {
  "use strict";

  var DEMO_MAPPINGS = [
    { warehouse_code: "WH-IST-01", wms_action_code: "SCRAP", sap_movement_type: "551", description: "Hurda cikisi", sap_to_plant: null, sap_to_stor_loc: null },
    { warehouse_code: "WH-IST-01", wms_action_code: "DAMAGED", sap_movement_type: "344", description: "Hasarli stok blokaj", sap_to_plant: null, sap_to_stor_loc: null },
    { warehouse_code: "WH-IST-01", wms_action_code: "TRANSFER_SLOC", sap_movement_type: "311", description: "Depo yeri transferi", sap_to_plant: null, sap_to_stor_loc: "0002" },
    { warehouse_code: "WH-ANK-01", wms_action_code: "SCRAP", sap_movement_type: "551", description: "Hurda cikisi", sap_to_plant: null, sap_to_stor_loc: null },
    { warehouse_code: "WH-ANK-01", wms_action_code: "TRANSFER_PLANT", sap_movement_type: "301", description: "Tesisler arasi transfer", sap_to_plant: "3000", sap_to_stor_loc: "0001" }
  ];

  var DEMO_TX = [
    { action: "INV_SCRAP", material: "000000002002", quantity: 15, uom: "EA", sap_movement_type: "551", warehouse_code: "WH-IST-01", status: "SUCCESS", sap_doc_number: "5000001240", created_at: "2026-02-10T10:30:00Z" },
    { action: "INV_DAMAGED", material: "000000003001", quantity: 5, uom: "EA", sap_movement_type: "344", warehouse_code: "WH-ANK-01", status: "FAILED", sap_doc_number: null, created_at: "2026-02-10T04:10:00Z" },
    { action: "INV_TRANSFER_SLOC", material: "000000001003", quantity: 200, uom: "EA", sap_movement_type: "311", warehouse_code: "WH-IST-01", status: "SUCCESS", sap_doc_number: "5000001242", created_at: "2026-02-10T09:00:00Z" }
  ];

  return Controller.extend("com.redigo.logistics.cockpit.controller.Inventory", {
    onInit: function () {
      this._oModel = new JSONModel({ mappings: [], transactions: [], count: 0 });
      this.getView().setModel(this._oModel, "inv");
      this._loadData();
    },
    _loadData: function () {
      var that = this;
      API.get("/api/inventory/mappings").then(function (result) { that._oModel.setProperty("/mappings", (result.data && result.data.length) ? result.data : DEMO_MAPPINGS); });
      API.get("/api/transactions", { action_like: "INV_", limit: 50 }).then(function (result) {
        var aRaw = (result.data && result.data.length) ? result.data : DEMO_TX;
        aRaw.forEach(function (tx) { tx.created_at_fmt = tx.created_at ? new Date(tx.created_at).toLocaleString("tr-TR") : ""; });
        that._oModel.setProperty("/transactions", aRaw);
        that._oModel.setProperty("/count", aRaw.length);
      });
    },
    onRefresh: function () { this._loadData(); sap.m.MessageToast.show("Yenilendi"); },
    onFilterChange: function () { this._loadData(); },
    onSearch: function (oEvent) {
      var sQuery = oEvent.getParameter("newValue");
      var oBinding = this.byId("invTxTable").getBinding("items");
      var aFilters = [];
      if (sQuery) { aFilters.push(new sap.ui.model.Filter("material", sap.ui.model.FilterOperator.Contains, sQuery)); }
      oBinding.filter(aFilters);
    }
  });
});
