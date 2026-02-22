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

    _loadProcessSteps: function (data) {
      var that = this;
      var sPlant = data.plant_code || "1000";
      var sWarehouse = data.warehouse_code;
      var sDeliveryType = data.sap_delivery_type;

      if (!sWarehouse || !sDeliveryType) { return; }

      API.get("/api/config/process-steps?plant_code=" + sPlant +
              "&warehouse_code=" + encodeURIComponent(sWarehouse) +
              "&delivery_type=" + encodeURIComponent(sDeliveryType))
        .then(function (result) {
          if (result && result.steps) {
            that._oModel.setProperty("/processSteps", result.steps);
            that._oModel.setProperty("/stepCount", result.steps.length);
            that._oModel.setProperty("/hasProcessConfig", true);
            that._oModel.setProperty("/selectedStep", {});
            var pc = result.process_config;
            if (pc) {
              that._oModel.setProperty("/process_type_desc", pc.delivery_type_desc + " (" + pc.process_type + ")");
              that._oModel.setProperty("/mvt_type", pc.mvt_type);
              that._oModel.setProperty("/logistics_company", pc.company_name);
            }
          } else {
            that._oModel.setProperty("/processSteps", []);
            that._oModel.setProperty("/stepCount", 0);
            that._oModel.setProperty("/hasProcessConfig", false);
          }
        })
        .catch(function () {
          that._oModel.setProperty("/hasProcessConfig", false);
          that._oModel.setProperty("/processSteps", []);
          that._oModel.setProperty("/stepCount", 0);
        });
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
      data.processSteps = [];
      data.stepCount = 0;
      data.hasProcessConfig = false;
      data.selectedStep = {};
      return data;
    },

    _loadDetail: function (sOrderId) {
      var that = this;
      API.get("/api/work-orders/" + sOrderId).then(function (result) {
        var data = result.data || result || {};
        data = that._formatDetail(data);
        that._oModel.setData(data);
        that._loadTransactions(sOrderId);
        that._loadProcessSteps(data);
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

    onStepSelectionChange: function () {
      var oList = this.byId("stepList");
      var aSelected = oList.getSelectedItems();
      if (aSelected.length > 0) {
        var oCtx = aSelected[aSelected.length - 1].getBindingContext("detail");
        if (oCtx) { this._oModel.setProperty("/selectedStep", JSON.parse(JSON.stringify(oCtx.getObject()))); }
      }
    },

    onStepPress: function (oEvent) {
      var oItem = oEvent.getParameter("listItem") || oEvent.getSource();
      var oCtx = oItem.getBindingContext("detail");
      if (oCtx) { this._oModel.setProperty("/selectedStep", JSON.parse(JSON.stringify(oCtx.getObject()))); }
    },

    onProcessSelected: function () {
      var oList = this.byId("stepList");
      var aSelected = oList.getSelectedItems();
      if (aSelected.length === 0) { MessageToast.show(this._getText("msgSelectStep")); return; }
      var aSteps = [];
      aSelected.forEach(function (oItem) {
        var oCtx = oItem.getBindingContext("detail");
        if (oCtx) { aSteps.push(oCtx.getObject()); }
      });
      this._executeSteps(aSteps);
    },

    onProcessAll: function () {
      var aSteps = this._oModel.getProperty("/processSteps") || [];
      var aPending = aSteps.filter(function (s) { return s.status === "BEKLIYOR" || s.status === "HATALI"; });
      if (aPending.length === 0) { MessageToast.show(this._getText("msgAllStepsComplete")); return; }
      this._executeSteps(aPending);
    },

    _executeSteps: function (aSteps) {
      var that = this;
      var sDeliveryNo = this._oModel.getProperty("/sap_delivery_no");
      var sWarehouse = this._oModel.getProperty("/warehouse_code");
      var sPlant = this._oModel.getProperty("/plant_code") || "1000";
      var sDeliveryType = this._oModel.getProperty("/sap_delivery_type");
      var sStepNames = aSteps.map(function (s) { return s.step_no + ". " + s.name; }).join("\n");

      MessageBox.confirm(
        this._getText("msgProcessConfirm", [aSteps.length, sStepNames]), {
        title: this._getText("msgExecuteConfirmTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            that._runStepsSequential(aSteps, 0, sDeliveryNo, sPlant, sWarehouse, sDeliveryType);
          }
        }
      });
    },

    _runStepsSequential: function (aSteps, iIndex, sDeliveryNo, sPlant, sWarehouse, sDeliveryType) {
      if (iIndex >= aSteps.length) { MessageToast.show(this._getText("msgAllStepsCompleted")); return; }
      var that = this;
      var oStep = aSteps[iIndex];
      var sStepPath = that._findStepPath(oStep.step_no);
      if (sStepPath) { that._oModel.setProperty(sStepPath + "/status", "ISLENIYOR"); }
      var oPayload = {
        delivery_no: sDeliveryNo, plant_code: sPlant, warehouse_code: sWarehouse,
        delivery_type: sDeliveryType, mvt_type: oStep.mvt_type, step_no: oStep.step_no, step_name: oStep.name
      };
      API.post(oStep.api_endpoint, oPayload)
        .then(function () {
          if (sStepPath) { that._oModel.setProperty(sStepPath + "/status", "BASARILI"); }
          that._runStepsSequential(aSteps, iIndex + 1, sDeliveryNo, sPlant, sWarehouse, sDeliveryType);
        })
        .catch(function (err) {
          if (sStepPath) { that._oModel.setProperty(sStepPath + "/status", "HATALI"); }
          MessageBox.error(that._getText("msgProcessStepError", [oStep.name, err.message || ""]));
        });
    },

    _findStepPath: function (iStepNo) {
      var aSteps = this._oModel.getProperty("/processSteps") || [];
      for (var i = 0; i < aSteps.length; i++) {
        if (aSteps[i].step_no === iStepNo) { return "/processSteps/" + i; }
      }
      return null;
    }
  });
});
