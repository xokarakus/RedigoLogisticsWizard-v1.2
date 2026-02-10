sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, API) {
  "use strict";

  var DEMO_DETAIL = {
    id: "d1",
    sap_delivery_no: "0080001234",
    sap_delivery_type: "LF",
    sap_doc_date: "2026-02-10",
    sap_ship_to: "CUST-001",
    sap_sold_to: "SOLD-001",
    order_type: "OUTBOUND",
    status: "PGI_POSTED",
    warehouse_code: "WH-IST-01",
    wms_order_id: "WMS-991234",
    received_at: "2026-02-10T08:30:00Z",
    sent_to_wms_at: "2026-02-10T08:31:00Z",
    completed_at: "2026-02-10T10:45:00Z",
    sap_posted_at: "2026-02-10T10:46:00Z",
    sap_raw_payload: { VBELN: "0080001234", LFART: "LF", WADAT_IST: "20260210" },
    wms_raw_payload: { orderId: "WMS-991234", status: "COMPLETED", pickedAt: "2026-02-10T10:45:00Z" },
    lines: [
      { sap_item_no: "000010", sap_material: "MAT-A100", sap_batch: "B2026001", sap_requested_qty: 100, wms_picked_qty: 100, sap_final_qty: 100, sap_uom: "EA", wms_uom: "EA", is_closed: true, wms_hu_ids: ["HU-001"], wms_serial_numbers: [] },
      { sap_item_no: "000020", sap_material: "MAT-B200", sap_batch: "B2026002", sap_requested_qty: 50, wms_picked_qty: 45, sap_final_qty: 45, sap_uom: "KG", wms_uom: "KG", is_closed: true, wms_hu_ids: ["HU-002", "HU-003"], wms_serial_numbers: [] },
      { sap_item_no: "000030", sap_material: "MAT-C300", sap_batch: "", sap_requested_qty: 200, wms_picked_qty: 200, sap_final_qty: 200, sap_uom: "EA", wms_uom: "EA", is_closed: true, wms_hu_ids: [], wms_serial_numbers: ["SN-001", "SN-002"] }
    ]
  };

  var DEMO_TX = [
    { action: "INGEST_DELIVERY", direction: "SAP_TO_MW", status: "SUCCESS", sap_function: "BAPI_DELIVERY_GETLIST", duration_ms: 120, retry_count: 0, started_at: "2026-02-10T08:30:00Z", error_message: "" },
    { action: "DISPATCH_TO_WMS", direction: "MW_TO_WMS", status: "SUCCESS", sap_function: null, duration_ms: 85, retry_count: 0, started_at: "2026-02-10T08:31:00Z", error_message: "" },
    { action: "WMS_CONFIRMATION", direction: "WMS_TO_MW", status: "SUCCESS", sap_function: null, duration_ms: 30, retry_count: 0, started_at: "2026-02-10T10:45:00Z", error_message: "" },
    { action: "UPDATE_DELIVERY_QTY", direction: "MW_TO_SAP", status: "SUCCESS", sap_function: "BAPI_OUTB_DELIVERY_CHANGE", duration_ms: 340, retry_count: 0, started_at: "2026-02-10T10:45:05Z", error_message: "" },
    { action: "POST_PGI", direction: "MW_TO_SAP", status: "SUCCESS", sap_function: "WS_DELIVERY_UPDATE", duration_ms: 280, retry_count: 1, started_at: "2026-02-10T10:45:10Z", error_message: "" }
  ];

  return Controller.extend("com.redigo.logistics.cockpit.controller.WorkOrderDetail", {

    onInit: function () {
      this._oModel = new JSONModel({});
      this.getView().setModel(this._oModel, "detail");
      this._loadDetail("d1");
    },

    _loadDetail: function (sOrderId) {
      var that = this;
      var data = JSON.parse(JSON.stringify(DEMO_DETAIL));

      data.received_at_fmt = data.received_at ? new Date(data.received_at).toLocaleString("tr-TR") : "-";
      data.sent_to_wms_at_fmt = data.sent_to_wms_at ? new Date(data.sent_to_wms_at).toLocaleString("tr-TR") : "-";
      data.completed_at_fmt = data.completed_at ? new Date(data.completed_at).toLocaleString("tr-TR") : "-";
      data.sap_posted_at_fmt = data.sap_posted_at ? new Date(data.sap_posted_at).toLocaleString("tr-TR") : "-";
      data.sap_raw_payload_str = JSON.stringify(data.sap_raw_payload, null, 2) || "{}";
      data.wms_raw_payload_str = JSON.stringify(data.wms_raw_payload, null, 2) || "{}";
      data.lineCount = (data.lines || []).length;

      (data.lines || []).forEach(function (line) {
        var aInfo = [];
        if (line.wms_hu_ids && line.wms_hu_ids.length) aInfo.push("HU: " + line.wms_hu_ids.join(", "));
        if (line.wms_serial_numbers && line.wms_serial_numbers.length) aInfo.push("SN: " + line.wms_serial_numbers.join(", "));
        line.hu_serial_info = aInfo.join(" | ") || "-";
      });

      that._oModel.setData(data);

      var aTx = DEMO_TX.map(function (tx) {
        var t = JSON.parse(JSON.stringify(tx));
        t.started_at_fmt = t.started_at ? new Date(t.started_at).toLocaleString("tr-TR") : "";
        return t;
      });
      that._oModel.setProperty("/transactions", aTx);
      that._oModel.setProperty("/txCount", aTx.length);
    },

    onNavBack: function () {
      this.getOwnerComponent().showView("workOrders");
    },

    onSendToWMS: function () {
      MessageToast.show("WMS'e gonderildi (demo mod)");
    }
  });
});
