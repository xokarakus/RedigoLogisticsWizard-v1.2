sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, MessageBox, API) {
  "use strict";

  /* Surec Tipi Hesaplama Tablosu (fallback) */
  var PROCESS_MAP = {
    "INBOUND_NL":    { process_type: "GR",              desc: "Mal Giris (Standart)", mvt_type: "101" },
    "INBOUND_EL":    { process_type: "GR",              desc: "Mal Giris (Tedarikci)", mvt_type: "101" },
    "OUTBOUND_LF":   { process_type: "GI",              desc: "Mal Cikis (Teslimat)", mvt_type: "601" },
    "OUTBOUND_NL":   { process_type: "GI",              desc: "Mal Cikis / Transfer", mvt_type: "601" },
    "INBOUND_LR":    { process_type: "RETURN",           desc: "Iade Mal Giris", mvt_type: "161" },
    "INBOUND_FASON": { process_type: "SUBCONTRACT_GR",   desc: "Fason Mal Giris", mvt_type: "101" },
    "OUTBOUND_FASON":{ process_type: "SUBCONTRACT_GI",   desc: "Fason Mal Cikis", mvt_type: "541" }
  };

  return Controller.extend("com.redigo.logistics.cockpit.controller.WorkOrderDetail", {

    onInit: function () {
      this._oModel = new JSONModel({});
      this.getView().setModel(this._oModel, "detail");
      // Register for each time this view is shown
      this.getView().addEventDelegate({
        onBeforeShow: this._onBeforeShow.bind(this)
      });
      this._loadDefault();
    },

    _onBeforeShow: function () {
      var oCtx = this.getOwnerComponent().getNavContext();
      if (oCtx && oCtx.orderId) {
        this._loadDetail(oCtx.orderId);
      }
    },

    _loadDefault: function () {
      var oCtx = this.getOwnerComponent().getNavContext();
      var sId = (oCtx && oCtx.orderId) ? oCtx.orderId : null;
      if (sId) {
        this._loadDetail(sId);
      }
      // Ilk acilista context yoksa bos birak
    },

    _getText: function (sKey, aArgs) {
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      return oBundle.getText(sKey, aArgs);
    },

    _resolveProcessInfo: function (data) {
      var sKey = data.order_type + "_" + data.sap_delivery_type;
      var oInfo = PROCESS_MAP[sKey];
      if (data.mvt_type === "301" || data.mvt_type === "311") {
        data.process_type_desc = "Transfer (" + data.mvt_type + ")";
        data.logistics_company = "-";
        return;
      }
      if (oInfo) {
        data.process_type_desc = oInfo.desc;
        if (!data.mvt_type) { data.mvt_type = oInfo.mvt_type; }
      } else {
        data.process_type_desc = data.order_type + " / " + data.sap_delivery_type;
      }
      data.logistics_company = "-";
    },

    _formatDetail: function (data) {
      data.received_at_fmt = data.received_at ? new Date(data.received_at).toLocaleString("tr-TR") : "-";
      data.sent_to_wms_at_fmt = data.sent_to_wms_at ? new Date(data.sent_to_wms_at).toLocaleString("tr-TR") : "-";
      data.completed_at_fmt = data.completed_at ? new Date(data.completed_at).toLocaleString("tr-TR") : "-";
      data.sap_posted_at_fmt = data.sap_posted_at ? new Date(data.sap_posted_at).toLocaleString("tr-TR") : "-";
      data.sap_raw_payload_str = JSON.stringify(data.sap_raw_payload || {}, null, 2);
      data.wms_raw_payload_str = JSON.stringify(data.wms_raw_payload || {}, null, 2);
      data.lineCount = (data.lines || []).length;
      (data.lines || []).forEach(function (line) {
        var aInfo = [];
        if (line.wms_hu_ids && line.wms_hu_ids.length) aInfo.push("HU: " + line.wms_hu_ids.join(", "));
        if (line.wms_serial_numbers && line.wms_serial_numbers.length) aInfo.push("SN: " + line.wms_serial_numbers.join(", "));
        line.hu_serial_info = aInfo.join(" | ") || "-";
      });
      this._resolveProcessInfo(data);
      return data;
    },

    _linesTop: 100,

    _loadDetail: function (sOrderId) {
      var that = this;
      this._currentOrderId = sOrderId;
      this._linesSkip = 0;
      API.get("/api/work-orders/" + sOrderId, {
        lines_skip: 0, lines_top: this._linesTop
      }).then(function (result) {
        var data = result.data || result || {};
        data = that._formatDetail(data);
        that._oModel.setData(data);
        that._loadTransactions(sOrderId);
      });
    },

    onLoadMoreLines: function () {
      var that = this;
      this._linesSkip = (this._linesSkip || 0) + this._linesTop;
      API.get("/api/work-orders/" + this._currentOrderId, {
        lines_skip: this._linesSkip, lines_top: this._linesTop
      }).then(function (result) {
        var data = result.data || {};
        var aNewLines = (data.lines || []).map(function (line) {
          var aInfo = [];
          if (line.wms_hu_ids && line.wms_hu_ids.length) aInfo.push("HU: " + line.wms_hu_ids.join(", "));
          if (line.wms_serial_numbers && line.wms_serial_numbers.length) aInfo.push("SN: " + line.wms_serial_numbers.join(", "));
          line.hu_serial_info = aInfo.join(" | ") || "-";
          return line;
        });
        var aExisting = that._oModel.getProperty("/lines") || [];
        that._oModel.setProperty("/lines", aExisting.concat(aNewLines));
        that._oModel.setProperty("/lineCount", aExisting.length + aNewLines.length);
        that._oModel.setProperty("/lines_has_more", data.lines_has_more);
        that._oModel.setProperty("/lines_total", data.lines_total);
      });
    },

    _loadTransactions: function (sOrderId) {
      var that = this;
      API.get("/api/transactions", { work_order_id: sOrderId, limit: 50 }).then(function (result) {
        var aTx = (result.data || []).map(function (tx) {
          tx.started_at_fmt = tx.started_at ? new Date(tx.started_at).toLocaleString("tr-TR") : "";
          return tx;
        });
        that._oModel.setProperty("/transactions", aTx);
        that._oModel.setProperty("/txCount", aTx.length);
      });
    },

    onNavBack: function () { this.getOwnerComponent().showView("workOrders"); },
    onSendToWMS: function () { MessageToast.show(this._getText("msgSentToWMSDemo")); },

    _placeholder: true
  });
});
