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
      }).catch(function () {
        MessageToast.show("\u0130\u015f emri detay\u0131 y\u00fcklenemedi");
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
      }).catch(function () {
        MessageToast.show("Ek kalemler y\u00fcklenemedi");
      });
    },

    /* ── Timeline formatting helpers ── */

    _ACTION_META: {
      CREATE_WORK_ORDER:  { icon: "sap-icon://create",          color: "#1a73e8", tr: "\u0130\u015f Emri Olu\u015fturuldu" },
      DISPATCH_TO_3PL:    { icon: "sap-icon://outbox",          color: "#e67700", tr: "3PL\u2019ye G\u00f6nderildi" },
      FETCH_FROM_SAP:     { icon: "sap-icon://download",        color: "#0854A0", tr: "SAP\u2019den Veri \u00c7ekildi" },
      QUERY_STATUS:       { icon: "sap-icon://inspection",      color: "#5b738b", tr: "Durum Sorguland\u0131" },
      POST_PGI:           { icon: "sap-icon://shipping-status", color: "#0a6ed1", tr: "PGI Kaydedildi (BAPI)" },
      POST_GR:            { icon: "sap-icon://inbox",           color: "#107e3e", tr: "Mal Giri\u015f Kaydedildi (BAPI)" },
      PGI_POST:           { icon: "sap-icon://shipping-status", color: "#0a6ed1", tr: "PGI Kaydedildi" },
      GR_POST:            { icon: "sap-icon://inbox",           color: "#107e3e", tr: "Mal Giri\u015f Kaydedildi" },
      DELIVERY_UPDATE:    { icon: "sap-icon://edit",            color: "#5b738b", tr: "Teslimat G\u00fcncellendi" },
      INV_MOVEMENT:       { icon: "sap-icon://inventory",       color: "#8b47d7", tr: "Stok Hareketi" },
      STATUS_CHANGE:      { icon: "sap-icon://status-positive", color: "#107e3e", tr: "Durum De\u011fi\u015fikli\u011fi" }
    },

    _STATUS_META: {
      SUCCESS:  { text: "Ba\u015far\u0131l\u0131",    state: "Success", icon: "sap-icon://accept" },
      FAILED:   { text: "Hatal\u0131",       state: "Error",   icon: "sap-icon://error" },
      DEAD:     { text: "\u00d6l\u00fc (DLQ)", state: "Error",   icon: "sap-icon://warning2" },
      PENDING:  { text: "Bekliyor",    state: "Warning", icon: "sap-icon://pending" },
      RETRYING: { text: "Tekrarlan\u0131yor", state: "Warning", icon: "sap-icon://refresh" }
    },

    _DIRECTION_LABELS: {
      SAP_TO_WMS: "SAP \u2192 WMS",
      WMS_TO_SAP: "WMS \u2192 SAP"
    },

    _relativeTime: function (sDate) {
      if (!sDate) return "";
      var diff = Date.now() - new Date(sDate).getTime();
      var sec = Math.floor(diff / 1000);
      if (sec < 60)    return sec + " sn \u00f6nce";
      var min = Math.floor(sec / 60);
      if (min < 60)    return min + " dk \u00f6nce";
      var hr = Math.floor(min / 60);
      if (hr < 24)     return hr + " saat \u00f6nce";
      var day = Math.floor(hr / 24);
      if (day < 30)    return day + " g\u00fcn \u00f6nce";
      return new Date(sDate).toLocaleString("tr-TR");
    },

    _enrichTransaction: function (tx) {
      var oAction = this._ACTION_META[tx.action];
      // OUTBOUND_* dynamic actions (e.g. OUTBOUND_GI, OUTBOUND_GR)
      if (!oAction && tx.action && tx.action.indexOf("OUTBOUND_") === 0) {
        oAction = { icon: "sap-icon://outbox", color: "#e67700", tr: "3PL\u2019ye G\u00f6nderildi (" + tx.action.substring(9) + ")" };
      }
      oAction = oAction || { icon: "sap-icon://action", color: "#5b738b", tr: tx.action };
      var oStatus = this._STATUS_META[tx.status] || { text: tx.status, state: "None", icon: "sap-icon://question-mark" };

      tx._icon = oAction.icon;
      tx._iconColor = oAction.color;
      tx._actionText = oAction.tr;
      tx._statusText = oStatus.text;
      tx._statusState = oStatus.state;
      tx._statusIcon = oStatus.icon;
      tx._directionBadge = this._DIRECTION_LABELS[tx.direction] || "";
      tx._relativeTime = this._relativeTime(tx.started_at);
      tx._durationText = tx.duration_ms ? tx.duration_ms + " ms" : "";
      tx._retryText = tx.retry_count > 0 ? tx.retry_count + " tekrar" : "";

      // Subtitle: SAP function + doc number
      var aParts = [];
      if (tx.sap_function) aParts.push(tx.sap_function);
      if (tx.sap_doc_number) aParts.push("Belge: " + tx.sap_doc_number);
      if (tx.correlation_id) aParts.push("Ref: " + tx.correlation_id.substring(0, 8));
      tx._subtitle = aParts.join("  \u00b7  ") || "";

      tx._highlight = tx.status === "SUCCESS" ? "Success" : tx.status === "FAILED" || tx.status === "DEAD" ? "Error" : "Warning";

      return tx;
    },

    _loadTransactions: function (sOrderId) {
      var that = this;
      API.get("/api/transactions", { work_order_id: sOrderId, limit: 50 }).then(function (result) {
        var aTx = (result.data || []).map(function (tx) {
          return that._enrichTransaction(tx);
        });
        that._oModel.setProperty("/transactions", aTx);
        that._oModel.setProperty("/txCount", aTx.length);
      }).catch(function () {
        MessageToast.show("\u0130\u015flem ge\u00e7mi\u015fi y\u00fcklenemedi");
      });
    },

    onNavBack: function () {
      var oCtx = this.getOwnerComponent().getNavContext();
      var sSource = (oCtx && oCtx.source) || "workOrders";
      this.getOwnerComponent().showView(sSource);
    },
    onSendToWMS: function () { MessageToast.show(this._getText("msgSentToWMSDemo")); },

    _placeholder: true
  });
});
