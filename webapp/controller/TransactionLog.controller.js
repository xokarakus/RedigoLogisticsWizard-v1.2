sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, API) {
  "use strict";

  var DEMO_TX = [
    { id: "t1", work_order_id: "d1", action: "OUTBOUND_CONFIRMATION", direction: "SAP_TO_WMS", status: "SUCCESS", sap_function: "BAPI_OUTB_DELIVERY_CHANGE", sap_doc_number: "5000001234", duration_ms: 320, retry_count: 0, started_at: "2026-02-10T09:10:00Z", error_message: null },
    { id: "t2", work_order_id: "d1", action: "PGI_POST", direction: "SAP_TO_WMS", status: "SUCCESS", sap_function: "WS_DELIVERY_UPDATE", sap_doc_number: "4900001234", duration_ms: 450, retry_count: 0, started_at: "2026-02-10T09:10:05Z", error_message: null },
    { id: "t3", work_order_id: "d3", action: "INBOUND_CONFIRMATION", direction: "WMS_TO_SAP", status: "SUCCESS", sap_function: "BAPI_GOODSMVT_CREATE", sap_doc_number: "5000001235", duration_ms: 280, retry_count: 0, started_at: "2026-02-10T08:15:00Z", error_message: null },
    { id: "t4", work_order_id: "d5", action: "INBOUND_CONFIRMATION", direction: "WMS_TO_SAP", status: "FAILED", sap_function: "BAPI_GOODSMVT_CREATE", sap_doc_number: null, duration_ms: 1200, retry_count: 3, started_at: "2026-02-10T06:25:00Z", error_message: "Over-delivery exceeds tolerance: 15.2% > 10%" },
    { id: "t5", work_order_id: "d2", action: "DISPATCH_TO_WMS", direction: "SAP_TO_WMS", status: "SUCCESS", sap_function: null, sap_doc_number: null, duration_ms: 95, retry_count: 0, started_at: "2026-02-10T09:16:00Z", error_message: null },
    { id: "t6", work_order_id: "d6", action: "OUTBOUND_CONFIRMATION", direction: "WMS_TO_SAP", status: "RETRYING", sap_function: "BAPI_OUTB_DELIVERY_CHANGE", sap_doc_number: null, duration_ms: 5000, retry_count: 1, started_at: "2026-02-10T11:20:00Z", error_message: "SAP connection timeout" },
    { id: "t7", work_order_id: null, action: "INV_SCRAP", direction: "WMS_TO_SAP", status: "SUCCESS", sap_function: "BAPI_GOODSMVT_CREATE", sap_doc_number: "5000001240", duration_ms: 310, retry_count: 0, started_at: "2026-02-10T10:30:00Z", error_message: null },
    { id: "t8", work_order_id: null, action: "INV_DAMAGED", direction: "WMS_TO_SAP", status: "DEAD", sap_function: "BAPI_GOODSMVT_CREATE", sap_doc_number: null, duration_ms: 8000, retry_count: 3, started_at: "2026-02-10T04:10:00Z", error_message: "Material 000000003001 not found in plant 2000" }
  ];

  return Controller.extend("com.redigo.logistics.cockpit.controller.TransactionLog", {
    onInit: function () {
      this._oModel = new JSONModel({ data: [], count: 0 });
      this.getView().setModel(this._oModel, "txLog");
      this._loadData();
    },
    _loadData: function () {
      var that = this;
      API.get("/api/transactions", { limit: 100 }).then(function (result) {
        var aRaw = (result.data && result.data.length) ? result.data : DEMO_TX;
        var aData = aRaw.map(function (tx) { tx.started_at_fmt = tx.started_at ? new Date(tx.started_at).toLocaleString("tr-TR") : ""; return tx; });
        that._oModel.setProperty("/data", aData);
        that._oModel.setProperty("/count", aData.length);
      });
    },
    onRefresh: function () { this._loadData(); },
    onFilterChange: function () { this._loadData(); },
    onSearch: function (oEvent) {
      var sQuery = oEvent.getParameter("newValue");
      var oBinding = this.byId("txTable").getBinding("items");
      var aFilters = [];
      if (sQuery) { aFilters.push(new sap.ui.model.Filter({ filters: [new sap.ui.model.Filter("action", sap.ui.model.FilterOperator.Contains, sQuery), new sap.ui.model.Filter("sap_function", sap.ui.model.FilterOperator.Contains, sQuery)], and: false })); }
      oBinding.filter(aFilters);
    },
    onTxPress: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("txLog");
      var sId = oCtx.getProperty("work_order_id");
      if (sId) {
        this.getOwnerComponent().showView("workOrderDetail");
      }
    }
  });
});
