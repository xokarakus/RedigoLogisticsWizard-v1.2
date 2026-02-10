sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, API) {
  "use strict";

  var DEMO_DATA = [
    { id: "d1", sap_delivery_no: "0080001234", sap_delivery_type: "LF", order_type: "OUTBOUND", status: "PGI_POSTED", warehouse_code: "WH-IST-01", sap_ship_to: "0000010001", line_count: 3, priority: 0, received_at: "2026-02-10T08:30:00Z", completed_at: "2026-02-10T09:15:00Z" },
    { id: "d2", sap_delivery_no: "0080001235", sap_delivery_type: "LF", order_type: "OUTBOUND", status: "IN_PROGRESS", warehouse_code: "WH-ANK-01", sap_ship_to: "0000010002", line_count: 5, priority: 2, received_at: "2026-02-10T09:15:00Z", completed_at: null },
    { id: "d3", sap_delivery_no: "0080001236", sap_delivery_type: "EL", order_type: "INBOUND", status: "GR_POSTED", warehouse_code: "WH-IZM-01", sap_ship_to: "0000020001", line_count: 2, priority: 0, received_at: "2026-02-10T07:45:00Z", completed_at: "2026-02-10T08:20:00Z" },
    { id: "d4", sap_delivery_no: "0080001237", sap_delivery_type: "NL", order_type: "OUTBOUND", status: "RECEIVED", warehouse_code: "WH-IST-01", sap_ship_to: "0000010003", line_count: 1, priority: 8, received_at: "2026-02-10T10:00:00Z", completed_at: null },
    { id: "d5", sap_delivery_no: "0080001238", sap_delivery_type: "RL", order_type: "INBOUND", status: "FAILED", warehouse_code: "WH-ANK-01", sap_ship_to: "0000020002", line_count: 4, priority: 0, received_at: "2026-02-10T06:20:00Z", completed_at: null },
    { id: "d6", sap_delivery_no: "0080001239", sap_delivery_type: "LF", order_type: "OUTBOUND", status: "PARTIALLY_DONE", warehouse_code: "WH-IZM-01", sap_ship_to: "0000010001", line_count: 7, priority: 1, received_at: "2026-02-10T11:10:00Z", completed_at: null },
    { id: "d7", sap_delivery_no: "0080001240", sap_delivery_type: "LF", order_type: "OUTBOUND", status: "SENT_TO_WMS", warehouse_code: "WH-IST-01", sap_ship_to: "0000010002", line_count: 2, priority: 0, received_at: "2026-02-10T11:30:00Z", completed_at: null },
    { id: "d8", sap_delivery_no: "0080001241", sap_delivery_type: "EL", order_type: "INBOUND", status: "COMPLETED", warehouse_code: "WH-ANK-01", sap_ship_to: "0000020001", line_count: 3, priority: 0, received_at: "2026-02-10T05:50:00Z", completed_at: "2026-02-10T06:40:00Z" },
    { id: "d9", sap_delivery_no: "0080001242", sap_delivery_type: "LF", order_type: "OUTBOUND", status: "CANCELLED", warehouse_code: "WH-IZM-01", sap_ship_to: "0000010003", line_count: 1, priority: 0, received_at: "2026-02-09T14:20:00Z", completed_at: null }
  ];

  return Controller.extend("com.redigo.logistics.cockpit.controller.WorkOrders", {
    onInit: function () {
      this._oModel = new JSONModel({ data: [], count: 0 });
      this.getView().setModel(this._oModel, "workOrders");
      this._filters = { type: "ALL", status: "ALL" };
      this._loadData();
    },
    _loadData: function () {
      var that = this;
      API.get("/api/work-orders", { limit: 100 }).then(function (result) {
        var aRaw = (result.data && result.data.length) ? result.data : DEMO_DATA;
        var aData = aRaw.map(function (o) {
          o.received_at_fmt = o.received_at ? new Date(o.received_at).toLocaleString("tr-TR") : "";
          o.completed_at_fmt = o.completed_at ? new Date(o.completed_at).toLocaleString("tr-TR") : "";
          return o;
        });
        that._oModel.setProperty("/data", aData);
        that._oModel.setProperty("/count", aData.length);
      });
    },
    onTypeFilterChange: function (oEvent) { this._filters.type = oEvent.getParameter("item").getKey(); this._loadData(); },
    onStatusFilterChange: function (oEvent) { this._filters.status = oEvent.getParameter("selectedItem").getKey(); this._loadData(); },
    onSearch: function (oEvent) {
      var sQuery = oEvent.getParameter("newValue");
      var oBinding = this.byId("workOrdersTable").getBinding("items");
      var aFilters = [];
      if (sQuery) { aFilters.push(new sap.ui.model.Filter("sap_delivery_no", sap.ui.model.FilterOperator.Contains, sQuery)); }
      oBinding.filter(aFilters);
    },
    onRefresh: function () { this._loadData(); sap.m.MessageToast.show("Yenilendi"); },
    onRowSelect: function (oEvent) { this.getOwnerComponent().showView("workOrderDetail"); },
    onRowPress: function (oEvent) { this.getOwnerComponent().showView("workOrderDetail"); },
    onExport: function () { sap.m.MessageToast.show("Export - yakinda"); }
  });
});
