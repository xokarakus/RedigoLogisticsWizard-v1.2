sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.Reports", {

    onInit: function () {
      this._oModel = new JSONModel({
        period: "30d",
        customFrom: null,
        customTo: null,
        cycleTimes: {},
        successRates: [],
        bottlenecks: [],
        failureReasons: [],
        warehouseSummary: [],
        warehouseSLA: [],
        warehouseTransactions: [],
        warehouseLoaded: false
      });
      this.getView().setModel(this._oModel, "report");
      this._loadProcessPerf();
    },

    _onBeforeShow: function () {
      this._loadProcessPerf();
    },

    // ── Tarih filtresi ──

    _buildPeriodParams: function () {
      var sPeriod = this._oModel.getProperty("/period");
      var sParams = "?period=" + sPeriod;
      if (sPeriod === "custom") {
        var oDateRange = this.byId("dateRange");
        if (oDateRange) {
          var oFrom = oDateRange.getDateValue();
          var oTo = oDateRange.getSecondDateValue();
          if (oFrom && oTo) {
            sParams += "&from=" + oFrom.toISOString() + "&to=" + oTo.toISOString();
          }
        }
      }
      return sParams;
    },

    onPeriodChange: function () {
      if (this._oModel.getProperty("/period") !== "custom") {
        this._reloadCurrentTab();
      }
    },

    onDateRangeChange: function () {
      this._reloadCurrentTab();
    },

    onRefresh: function () {
      this._reloadCurrentTab();
      MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("msgRefreshed"));
    },

    onTabSelect: function (oEvent) {
      var sKey = oEvent.getParameter("key");
      if (sKey === "warehousePerf" && !this._oModel.getProperty("/warehouseLoaded")) {
        this._loadWarehousePerf();
      }
    },

    _reloadCurrentTab: function () {
      var oTabBar = this.byId("reportTabs");
      var sKey = oTabBar ? oTabBar.getSelectedKey() : "processPerf";
      if (sKey === "warehousePerf") {
        this._loadWarehousePerf();
      } else {
        this._loadProcessPerf();
      }
    },

    // ── Sekme A: Surec Performans Analizi ──

    _loadProcessPerf: function () {
      var sParams = this._buildPeriodParams();
      var that = this;

      Promise.all([
        API.get("/api/reports/cycle-times" + sParams),
        API.get("/api/reports/success-rates" + sParams),
        API.get("/api/reports/bottlenecks" + sParams),
        API.get("/api/reports/failure-reasons" + sParams)
      ]).then(function (results) {
        that._oModel.setProperty("/cycleTimes", results[0] || {});
        that._oModel.setProperty("/successRates", (results[1] && results[1].data) || []);
        that._oModel.setProperty("/bottlenecks", (results[2] && results[2].data) || []);
        that._oModel.setProperty("/failureReasons", (results[3] && results[3].data) || []);
      }).catch(function (err) {
        MessageToast.show("Rapor y\u00fcklenemedi: " + (err.message || err));
      });
    },

    // ── Sekme B: Depo & 3PL Performans ──

    _loadWarehousePerf: function () {
      var sParams = this._buildPeriodParams();
      var that = this;

      Promise.all([
        API.get("/api/reports/warehouse-summary" + sParams),
        API.get("/api/reports/warehouse-sla" + sParams),
        API.get("/api/reports/warehouse-transactions" + sParams)
      ]).then(function (results) {
        that._oModel.setProperty("/warehouseSummary", (results[0] && results[0].data) || []);
        that._oModel.setProperty("/warehouseSLA", (results[1] && results[1].data) || []);
        that._oModel.setProperty("/warehouseTransactions", (results[2] && results[2].data) || []);
        that._oModel.setProperty("/warehouseLoaded", true);
      }).catch(function (err) {
        MessageToast.show("Depo raporu y\u00fcklenemedi: " + (err.message || err));
      });
    }
  });
});
