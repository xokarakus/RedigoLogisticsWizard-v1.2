sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageBox, MessageToast, API) {
  "use strict";

  var DEMO_RECON = [
    { id: "r1", run_date: "2026-02-10", warehouse_code: "WH-IST-01", total_sap_open: 45, total_wms_open: 43, discrepancies: [{ delivery: "0080001199", issue: "SAP'de acik, WMS'de yok" }, { delivery: "0080001205", issue: "Miktar uyusmazligi" }], status: "COMPLETED", reviewed_by: null },
    { id: "r2", run_date: "2026-02-10", warehouse_code: "WH-ANK-01", total_sap_open: 22, total_wms_open: 22, discrepancies: [], status: "COMPLETED", reviewed_by: null },
    { id: "r3", run_date: "2026-02-10", warehouse_code: "WH-IZM-01", total_sap_open: 18, total_wms_open: 19, discrepancies: [{ delivery: "WMS-887321", issue: "WMS'de var, SAP'de yok" }], status: "COMPLETED", reviewed_by: null },
    { id: "r4", run_date: "2026-02-09", warehouse_code: "WH-IST-01", total_sap_open: 51, total_wms_open: 51, discrepancies: [], status: "REVIEWED", reviewed_by: "ahmet.demir" },
    { id: "r5", run_date: "2026-02-09", warehouse_code: "WH-ANK-01", total_sap_open: 25, total_wms_open: 24, discrepancies: [{ delivery: "0080001180", issue: "SAP'de acik, WMS tamamladi" }], status: "REVIEWED", reviewed_by: "mehmet.yilmaz" }
  ];

  return Controller.extend("com.redigo.logistics.cockpit.controller.Reconciliation", {
    onInit: function () {
      this._oModel = new JSONModel({ data: [], count: 0 });
      this.getView().setModel(this._oModel, "recon");
      this._loadData();
    },
    _loadData: function () {
      var that = this;
      API.get("/api/reconciliation").then(function (result) {
        var aRaw = (result.data && result.data.length) ? result.data : DEMO_RECON;
        aRaw.forEach(function (r) { r.discrepancy_count = (r.discrepancies || []).length; });
        that._oModel.setProperty("/data", aRaw);
        that._oModel.setProperty("/count", aRaw.length);
      });
    },
    onRefresh: function () { this._loadData(); },
    onRunNow: function () {
      MessageBox.confirm("Tum depolar icin mutabakat baslatilsin mi?", {
        onClose: function (sAction) { if (sAction === MessageBox.Action.OK) { MessageToast.show("Mutabakat baslatildi (demo mod)"); } }
      });
    },
    onViewDetails: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("recon");
      var aDisc = oCtx.getProperty("discrepancies") || [];
      var sDetails = aDisc.map(function (d) { return d.delivery + ": " + d.issue; }).join("\n") || "Uyusmazlik bulunamadi.";
      MessageBox.information(sDetails, { title: "Uyusmazlik Detaylari" });
    },
    onMarkReviewed: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("recon");
      var iIdx = oCtx.getPath().split("/").pop();
      this._oModel.setProperty("/data/" + iIdx + "/status", "REVIEWED");
      this._oModel.setProperty("/data/" + iIdx + "/reviewed_by", "cockpit_user");
      MessageToast.show("Incelendi olarak isaretlendi");
    }
  });
});
