sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageBox, MessageToast, API) {
  "use strict";

  var DEMO_DLQ = [
    { id: "t4", action: "INBOUND_CONFIRMATION", sap_function: "BAPI_GOODSMVT_CREATE", delivery_no: "0080001238", retry_count: 3, error_message: "Over-delivery exceeds tolerance: 15.2% > 10%. Material: 000000001001", started_at: "2026-02-10T06:25:00Z", sap_request: { GOODSMVT_HEADER: { PSTNG_DATE: "20260210" }, GOODSMVT_ITEM: [{ MATERIAL: "000000001001", ENTRY_QNT: 115 }] }, edited_payload: null },
    { id: "t8", action: "INV_DAMAGED", sap_function: "BAPI_GOODSMVT_CREATE", delivery_no: "-", retry_count: 3, error_message: "Material 000000003001 not found in plant 2000", started_at: "2026-02-10T04:10:00Z", sap_request: { material: "000000003001", quantity: 5, movement_type: "344" }, edited_payload: null },
    { id: "t9", action: "PGI_POST", sap_function: "WS_DELIVERY_UPDATE", delivery_no: "0080001245", retry_count: 3, error_message: "Delivery 0080001245 is locked by user RFC_BATCH", started_at: "2026-02-09T22:15:00Z", sap_request: { VBKOK_WA: { VBELN_VL: "0080001245", WABUC: "X" } }, edited_payload: null }
  ];

  return Controller.extend("com.redigo.logistics.cockpit.controller.DeadLetterQueue", {
    onInit: function () {
      this._oModel = new JSONModel({ data: [], count: 0, editVisible: false, selectedId: null, selectedOriginal: "", selectedEdited: "" });
      this.getView().setModel(this._oModel, "dlq");
      this._loadData();
    },
    _loadData: function () {
      var that = this;
      API.get("/api/transactions", { status: "DEAD", limit: 100 }).then(function (result) {
        var aRaw = (result.data && result.data.length) ? result.data : DEMO_DLQ;
        var aData = aRaw.map(function (tx) { tx.started_at_fmt = tx.started_at ? new Date(tx.started_at).toLocaleString("tr-TR") : ""; return tx; });
        that._oModel.setProperty("/data", aData);
        that._oModel.setProperty("/count", aData.length);
      });
    },
    onRefresh: function () { this._loadData(); },
    onEditPayload: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("dlq");
      var oItem = oCtx.getObject();
      this._oModel.setProperty("/selectedId", oItem.id);
      this._oModel.setProperty("/selectedOriginal", JSON.stringify(oItem.sap_request, null, 2));
      this._oModel.setProperty("/selectedEdited", JSON.stringify(oItem.edited_payload || oItem.sap_request, null, 2));
      this._oModel.setProperty("/editVisible", true);
    },
    onCancelEdit: function () { this._oModel.setProperty("/editVisible", false); },
    onSaveAndReplay: function () {
      var sEdited = this._oModel.getProperty("/selectedEdited");
      try { JSON.parse(sEdited); } catch (e) { MessageBox.error("Gecersiz JSON."); return; }
      MessageToast.show("Replay tetiklendi (demo mod)");
      this._oModel.setProperty("/editVisible", false);
    },
    onReplay: function () {
      MessageBox.confirm("Bu islemi tekrar oynatmak istiyor musunuz?", {
        onClose: function (sAction) { if (sAction === MessageBox.Action.OK) { MessageToast.show("Replay tetiklendi (demo mod)"); } }
      });
    },
    onDiscard: function () {
      MessageBox.warning("Bu hatali islemi iptal etmek istediginizden emin misiniz?", {
        actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
        onClose: function (sAction) { if (sAction === MessageBox.Action.DELETE) { MessageToast.show("Islem iptal edildi (demo mod)"); } }
      });
    }
  });
});
