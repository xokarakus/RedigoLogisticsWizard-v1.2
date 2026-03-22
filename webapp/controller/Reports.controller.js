sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Table",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/Text",
  "sap/m/ObjectStatus",
  "sap/m/Title",
  "sap/ui/core/HTML",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, Dialog, Button, MTable, Column, ColumnListItem, Text, ObjectStatus, Title, HTML, API) {
  "use strict";

  var COLORS = {
    blue: "#0854A0",
    red: "#BB0000",
    orange: "#E78C07",
    green: "#2B7C2B",
    teal: "#5899DA",
    purple: "#945ECF",
    pink: "#D4488A",
    cyan: "#13A4B4",
    lime: "#6C8915",
    gold: "#C87E00"
  };

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
        warehouseLoaded: false,
        trendOrders: [],
        trendCycleTime: []
      });
      this.getView().setModel(this._oModel, "report");
      this._charts = {};
      this._loadProcessPerf();
    },

    _onBeforeShow: function () {
      this._loadProcessPerf();
    },

    // ── i18n helper ──
    _i18n: function (sKey, aArgs) {
      return this.getView().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
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
      MessageToast.show(this._i18n("msgRefreshed"));
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
      this._oModel.setProperty("/warehouseLoaded", false);
      if (sKey === "warehousePerf") {
        this._loadWarehousePerf();
      } else {
        this._loadProcessPerf();
      }
    },

    // ══════════════════════════════════════
    // SEKME A: Surec Performans Analizi
    // ══════════════════════════════════════

    _loadProcessPerf: function () {
      var sParams = this._buildPeriodParams();
      var that = this;

      Promise.all([
        API.get("/api/reports/cycle-times" + sParams),
        API.get("/api/reports/success-rates" + sParams),
        API.get("/api/reports/bottlenecks" + sParams),
        API.get("/api/reports/failure-reasons" + sParams),
        API.get("/api/reports/trend/orders" + sParams),
        API.get("/api/reports/trend/cycle-time" + sParams)
      ]).then(function (results) {
        that._oModel.setProperty("/cycleTimes", results[0] || {});
        that._oModel.setProperty("/successRates", (results[1] && results[1].data) || []);
        that._oModel.setProperty("/bottlenecks", (results[2] && results[2].data) || []);
        that._oModel.setProperty("/failureReasons", (results[3] && results[3].data) || []);
        that._oModel.setProperty("/trendOrders", (results[4] && results[4].data) || []);
        that._oModel.setProperty("/trendCycleTime", (results[5] && results[5].data) || []);
        that._renderProcessCharts();
      }).catch(function (err) {
        MessageToast.show(that._i18n("errReportLoad") + ": " + (err.message || err));
      });
    },

    // ══════════════════════════════════════
    // SEKME B: Depo & 3PL Performans
    // ══════════════════════════════════════

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
        that._renderWarehouseCharts();
      }).catch(function (err) {
        MessageToast.show(that._i18n("errWarehouseReportLoad") + ": " + (err.message || err));
      });
    },

    // ══════════════════════════════════════
    // CHART RENDERING
    // ══════════════════════════════════════

    _destroyChart: function (sKey) {
      if (this._charts[sKey]) {
        this._charts[sKey].destroy();
        delete this._charts[sKey];
      }
    },

    _renderChart: function (sContainerId, sCanvasId, sChartKey, fnCreate) {
      var oContainer = this.byId(sContainerId);
      if (!oContainer) return;
      oContainer.removeAllItems();
      this._destroyChart(sChartKey);

      var oHtml = new HTML({ content: '<canvas id="' + sCanvasId + '" style="width:100%;height:100%"></canvas>' });
      oContainer.addItem(oHtml);

      var that = this;
      setTimeout(function () {
        var el = document.getElementById(sCanvasId);
        if (!el || typeof Chart === "undefined") return;
        that._charts[sChartKey] = fnCreate(el);
      }, 150);
    },

    _renderProcessCharts: function () {
      this._renderOrderTrendChart();
      this._renderCycleTrendChart();
      this._renderSuccessRatesChart();
      this._renderErrorDistChart();
    },

    _renderWarehouseCharts: function () {
      this._renderWarehouseCompChart();
    },

    // Chart 1: Gunluk Siparis Trendi (Line)
    _renderOrderTrendChart: function () {
      var aData = this._oModel.getProperty("/trendOrders") || [];
      if (aData.length === 0) return;

      var aLabels = aData.map(function (d) { return d.day; });
      var that = this;
      this._renderChart("chartOrderTrendContainer", "canvasOrderTrend", "orderTrend", function (el) {
        return new Chart(el, {
          type: "line",
          data: {
            labels: aLabels,
            datasets: [
              { label: that._i18n("chartTotal"), data: aData.map(function (d) { return Number(d.total); }), borderColor: COLORS.blue, backgroundColor: COLORS.blue + "20", tension: 0.3, fill: false },
              { label: that._i18n("chartCompleted"), data: aData.map(function (d) { return Number(d.completed); }), borderColor: COLORS.green, backgroundColor: COLORS.green + "20", tension: 0.3, fill: false },
              { label: that._i18n("chartFailed"), data: aData.map(function (d) { return Number(d.failed); }), borderColor: COLORS.red, backgroundColor: COLORS.red + "20", tension: 0.3, fill: false }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "top" } },
            scales: { y: { beginAtZero: true } }
          }
        });
      });
    },

    // Chart 2: Gunluk Dongu Suresi Trendi (Line, filled)
    _renderCycleTrendChart: function () {
      var aData = this._oModel.getProperty("/trendCycleTime") || [];
      if (aData.length === 0) return;

      var aLabels = aData.map(function (d) { return d.day; });
      var that = this;
      this._renderChart("chartCycleTrendContainer", "canvasCycleTrend", "cycleTrend", function (el) {
        return new Chart(el, {
          type: "line",
          data: {
            labels: aLabels,
            datasets: [{
              label: that._i18n("chartAvgCycle"),
              data: aData.map(function (d) { return Number(d.avg_cycle_min); }),
              borderColor: COLORS.teal,
              backgroundColor: COLORS.teal + "30",
              tension: 0.3,
              fill: true
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "top" } },
            scales: { y: { beginAtZero: true } }
          }
        });
      });
    },

    // Chart 3: Surec Basari Oranlari (Bar, stacked)
    _renderSuccessRatesChart: function () {
      var aData = this._oModel.getProperty("/successRates") || [];
      if (aData.length === 0) return;

      var aLabels = aData.map(function (d) { return d.process_type || "-"; });
      var that = this;
      this._renderChart("chartSuccessRatesContainer", "canvasSuccessRates", "successRates", function (el) {
        return new Chart(el, {
          type: "bar",
          data: {
            labels: aLabels,
            datasets: [
              { label: that._i18n("chartSuccessful"), data: aData.map(function (d) { return Number(d.success); }), backgroundColor: COLORS.green },
              { label: that._i18n("chartFailed"), data: aData.map(function (d) { return Number(d.failed); }), backgroundColor: COLORS.red },
              { label: that._i18n("chartPending"), data: aData.map(function (d) { return Number(d.pending); }), backgroundColor: COLORS.orange }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "top" } },
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
          }
        });
      });
    },

    // Chart 4: Hata Dagilimi (Doughnut)
    _renderErrorDistChart: function () {
      var aData = this._oModel.getProperty("/failureReasons") || [];
      if (aData.length === 0) return;

      var aTop = aData.slice(0, 10);
      var aLabels = aTop.map(function (d) { return d.error_code || "UNKNOWN"; });
      var aValues = aTop.map(function (d) { return Number(d.occurrence_count); });
      var aPalette = [COLORS.red, COLORS.orange, COLORS.blue, COLORS.teal, COLORS.purple, COLORS.pink, COLORS.cyan, COLORS.lime, COLORS.gold, COLORS.green];

      this._renderChart("chartErrorDistContainer", "canvasErrorDist", "errorDist", function (el) {
        return new Chart(el, {
          type: "doughnut",
          data: {
            labels: aLabels,
            datasets: [{ data: aValues, backgroundColor: aPalette.slice(0, aTop.length) }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "right" } }
          }
        });
      });
    },

    // Chart 5: Depo Karsilastirmasi (Bar, stacked)
    _renderWarehouseCompChart: function () {
      var aData = this._oModel.getProperty("/warehouseSummary") || [];
      if (aData.length === 0) return;

      var aLabels = aData.map(function (d) { return d.warehouse_code || "-"; });
      var that = this;
      this._renderChart("chartWarehouseCompContainer", "canvasWarehouseComp", "warehouseComp", function (el) {
        return new Chart(el, {
          type: "bar",
          data: {
            labels: aLabels,
            datasets: [
              { label: that._i18n("chartCompleted"), data: aData.map(function (d) { return Number(d.completed); }), backgroundColor: COLORS.green },
              { label: that._i18n("chartFailed"), data: aData.map(function (d) { return Number(d.failed); }), backgroundColor: COLORS.red }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "top" } },
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
          }
        });
      });
    },

    // ══════════════════════════════════════
    // DRILL-DOWN DIALOGS
    // ══════════════════════════════════════

    onSuccessRateRowPress: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("report");
      var sType = oCtx.getProperty("process_type");
      var sParams = this._buildPeriodParams() + "&process_type=" + encodeURIComponent(sType);
      var that = this;

      API.get("/api/reports/drill/process-orders" + sParams).then(function (result) {
        that._showDrillDialog(that._i18n("rptDrillProcessTitle") + ": " + sType, (result && result.data) || []);
      });
    },

    onWarehouseRowPress: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("report");
      var sCode = oCtx.getProperty("warehouse_code");
      var sParams = this._buildPeriodParams() + "&warehouse_code=" + encodeURIComponent(sCode);
      var that = this;

      API.get("/api/reports/drill/warehouse-orders" + sParams).then(function (result) {
        that._showDrillDialog(that._i18n("rptDrillWarehouseTitle") + ": " + sCode, (result && result.data) || []);
      });
    },

    onFailureRowPress: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("report");
      var sCode = oCtx.getProperty("error_code");
      var sParams = this._buildPeriodParams() + "&error_code=" + encodeURIComponent(sCode);
      var that = this;

      API.get("/api/reports/drill/error-orders" + sParams).then(function (result) {
        that._showDrillDialog(that._i18n("rptDrillErrorTitle") + ": " + sCode, (result && result.data) || []);
      });
    },

    _showDrillDialog: function (sTitle, aData) {
      var oModel = new JSONModel({ items: aData });

      var oTable = new MTable({
        growing: true,
        growingThreshold: 20,
        columns: [
          new Column({ header: new Text({ text: this._i18n("rptDeliveryNo") }) }),
          new Column({ header: new Text({ text: this._i18n("rptStatus") }), width: "120px" }),
          new Column({ header: new Text({ text: this._i18n("rptWarehouseCode") }), width: "120px" }),
          new Column({ header: new Text({ text: this._i18n("rptReceivedAt") }), width: "160px" }),
          new Column({ header: new Text({ text: this._i18n("rptCompletedAt") }), width: "160px" }),
          new Column({ header: new Text({ text: this._i18n("rptErrorCode") }), width: "130px" }),
          new Column({ header: new Text({ text: this._i18n("rptErrorMessage") }) })
        ]
      });

      oTable.setModel(oModel);
      oTable.bindItems("/items", new ColumnListItem({
        cells: [
          new Text({ text: "{sap_delivery_no}" }),
          new ObjectStatus({
            text: "{status}",
            state: {
              path: "status",
              formatter: function (s) {
                if (s === "COMPLETED" || s === "PGI_POSTED" || s === "GR_POSTED") return "Success";
                if (s === "FAILED") return "Error";
                return "Warning";
              }
            }
          }),
          new Text({ text: "{warehouse_code}" }),
          new Text({ text: "{received_at}" }),
          new Text({ text: "{completed_at}" }),
          new ObjectStatus({ text: "{error_code}", state: "Error" }),
          new Text({ text: "{error_message}", wrapping: true })
        ]
      }));

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "900px",
        resizable: true,
        draggable: true,
        content: [oTable],
        endButton: new Button({
          text: this._i18n("btnClose"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    // ══════════════════════════════════════
    // CSV EXPORT
    // ══════════════════════════════════════

    _exportReport: function (sReportName) {
      var sParams = this._buildPeriodParams() + "&format=csv";
      var sUrl = API._baseUrl + "/api/reports/export/" + sReportName + sParams;
      var sToken = localStorage.getItem("redigo_token");
      var that = this;

      fetch(sUrl, {
        headers: { "Authorization": "Bearer " + sToken }
      }).then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.blob();
      }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = sReportName + ".csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }).catch(function (err) {
        MessageToast.show(that._i18n("errExportFailed", [err.message || err]));
      });
    },

    onExportSuccessRates: function () { this._exportReport("success-rates"); },
    onExportBottlenecks: function () { this._exportReport("bottlenecks"); },
    onExportFailureReasons: function () { this._exportReport("failure-reasons"); },
    onExportWarehouseSummary: function () { this._exportReport("warehouse-summary"); },
    onExportWarehouseSla: function () { this._exportReport("warehouse-sla"); },
    onExportWarehouseTransactions: function () { this._exportReport("warehouse-transactions"); }
  });
});
