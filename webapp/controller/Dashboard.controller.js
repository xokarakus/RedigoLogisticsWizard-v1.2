sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, API) {
  "use strict";

  // Demo data when backend is not available
  var DEMO_KPIS = {
    totalOrders: 1247,
    inProgress: 23,
    completedToday: 89,
    failedCount: 3,
    todayIngest: 142,
    pendingSAP: 7,
    dlqCount: 3,
    avgLatency: 245
  };

  var DEMO_ORDERS = [
    { id: "d1", sap_delivery_no: "0080001234", sap_delivery_type: "LF", order_type: "OUTBOUND", status: "PGI_POSTED", warehouse_code: "WH-IST-01", line_count: 3, received_at: "2026-02-10T08:30:00Z" },
    { id: "d2", sap_delivery_no: "0080001235", sap_delivery_type: "LF", order_type: "OUTBOUND", status: "IN_PROGRESS", warehouse_code: "WH-ANK-01", line_count: 5, received_at: "2026-02-10T09:15:00Z" },
    { id: "d3", sap_delivery_no: "0080001236", sap_delivery_type: "EL", order_type: "INBOUND", status: "GR_POSTED", warehouse_code: "WH-IZM-01", line_count: 2, received_at: "2026-02-10T07:45:00Z" },
    { id: "d4", sap_delivery_no: "0080001237", sap_delivery_type: "NL", order_type: "OUTBOUND", status: "RECEIVED", warehouse_code: "WH-IST-01", line_count: 1, received_at: "2026-02-10T10:00:00Z" },
    { id: "d5", sap_delivery_no: "0080001238", sap_delivery_type: "RL", order_type: "INBOUND", status: "FAILED", warehouse_code: "WH-ANK-01", line_count: 4, received_at: "2026-02-10T06:20:00Z" },
    { id: "d6", sap_delivery_no: "0080001239", sap_delivery_type: "LF", order_type: "OUTBOUND", status: "PARTIALLY_DONE", warehouse_code: "WH-IZM-01", line_count: 7, received_at: "2026-02-10T11:10:00Z" },
    { id: "d7", sap_delivery_no: "0080001240", sap_delivery_type: "LF", order_type: "OUTBOUND", status: "SENT_TO_WMS", warehouse_code: "WH-IST-01", line_count: 2, received_at: "2026-02-10T11:30:00Z" },
    { id: "d8", sap_delivery_no: "0080001241", sap_delivery_type: "EL", order_type: "INBOUND", status: "COMPLETED", warehouse_code: "WH-ANK-01", line_count: 3, received_at: "2026-02-10T05:50:00Z" }
  ];

  return Controller.extend("com.redigo.logistics.cockpit.controller.Dashboard", {

    onInit: function () {
      var oDashModel = new JSONModel({
        totalOrders: 0,
        inProgress: 0,
        completedToday: 0,
        failedCount: 0,
        todayIngest: 0,
        pendingSAP: 0,
        dlqCount: 0,
        avgLatency: 0,
        recentOrders: []
      });
      this.getView().setModel(oDashModel, "dashboard");

      this._loadDashboardData();
    },

    _loadDashboardData: function () {
      var oModel = this.getView().getModel("dashboard");

      // Load KPIs
      API.get("/api/dashboard/kpis").then(function (data) {
        var kpis = data.totalOrders !== undefined ? data : DEMO_KPIS;
        oModel.setProperty("/totalOrders", kpis.totalOrders);
        oModel.setProperty("/inProgress", kpis.inProgress);
        oModel.setProperty("/completedToday", kpis.completedToday);
        oModel.setProperty("/failedCount", kpis.failedCount);
        oModel.setProperty("/todayIngest", kpis.todayIngest);
        oModel.setProperty("/pendingSAP", kpis.pendingSAP);
        oModel.setProperty("/dlqCount", kpis.dlqCount);
        oModel.setProperty("/avgLatency", kpis.avgLatency);
      });

      // Load recent orders
      API.get("/api/work-orders", { limit: 20 }).then(function (data) {
        var aRaw = (data.data && data.data.length) ? data.data : DEMO_ORDERS;
        var aOrders = aRaw.map(function (o) {
          o.received_at_formatted = o.received_at ? new Date(o.received_at).toLocaleString("tr-TR") : "-";
          return o;
        });
        oModel.setProperty("/recentOrders", aOrders);
      });
    },

    onRefreshDashboard: function () {
      this._loadDashboardData();
      sap.m.MessageToast.show("Yenilendi");
    },

    onTilePress: function () {
      this.getOwnerComponent().showView("workOrders");
    },

    onOrderSelect: function (oEvent) {
      this.getOwnerComponent().showView("workOrderDetail");
    },

    onOrderPress: function (oEvent) {
      this.getOwnerComponent().showView("workOrderDetail");
    },

    onSearchOrders: function (oEvent) {
      var sQuery = oEvent.getParameter("newValue");
      var oTable = this.byId("recentOrdersTable");
      var oBinding = oTable.getBinding("items");
      var aFilters = [];

      if (sQuery) {
        aFilters.push(new sap.ui.model.Filter({
          filters: [
            new sap.ui.model.Filter("sap_delivery_no", sap.ui.model.FilterOperator.Contains, sQuery),
            new sap.ui.model.Filter("warehouse_code", sap.ui.model.FilterOperator.Contains, sQuery)
          ],
          and: false
        }));
      }
      oBinding.filter(aFilters);
    }
  });
});
