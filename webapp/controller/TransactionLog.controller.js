sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/IconTabBar",
  "sap/m/IconTabFilter",
  "sap/m/VBox",
  "sap/m/HBox",
  "sap/m/Label",
  "sap/m/Text",
  "sap/m/TextArea",
  "sap/m/ObjectStatus",
  "sap/m/MessageStrip",
  "sap/m/BusyIndicator",
  "sap/m/MessageBox",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, Filter, FilterOperator, Dialog, Button, IconTabBar, IconTabFilter, VBox, HBox, Label, Text, TextArea, ObjectStatus, MessageStrip, BusyIndicator, MessageBox, API) {
  "use strict";

  var MAX_JSON_DISPLAY = 50000; // 50KB limit for JSON display

  var ACTION_LABELS = {
    CREATE_WORK_ORDER:  "\u0130\u015f Emri Olu\u015fturuldu",
    DISPATCH_TO_3PL:    "3PL\u2019ye G\u00f6nderildi",
    FETCH_FROM_SAP:     "SAP\u2019den Veri \u00c7ekildi",
    QUERY_STATUS:       "Durum Sorguland\u0131",
    POST_PGI:           "PGI (Mal \u00c7\u0131k\u0131\u015f) Kaydedildi",
    POST_GR:            "GR (Mal Giri\u015f) Kaydedildi",
    PGI_POST:           "PGI Kaydedildi",
    GR_POST:            "Mal Giri\u015f Kaydedildi",
    DELIVERY_UPDATE:    "Teslimat G\u00fcncellendi",
    INV_MOVEMENT:       "Stok Hareketi",
    STATUS_CHANGE:      "Durum De\u011fi\u015fikli\u011fi",
    INBOUND_DELIVERY:   "Gelen Teslimat",
    OUTBOUND_DELIVERY:  "Giden Teslimat",
    QUANTITY_CHANGE:    "Miktar De\u011fi\u015fikli\u011fi",
    SAP_REFRESH:        "SAP Verisi Yenilendi"
  };

  function getActionLabel(sAction) {
    if (!sAction) return "";
    if (ACTION_LABELS[sAction]) return ACTION_LABELS[sAction];
    if (sAction.indexOf("OUTBOUND_") === 0) {
      return "3PL\u2019ye G\u00f6nderildi (" + sAction.substring(9) + ")";
    }
    return sAction;
  }

  return Controller.extend("com.redigo.logistics.cockpit.controller.TransactionLog", {
    onInit: function () {
      this._oModel = new JSONModel({ data: [], count: 0, countText: "", actionOptions: [] });
      this.getView().setModel(this._oModel, "txLog");
      this._sSearchQuery = "";
      this._loadData();
    },

    _getText: function (sKey, aArgs) {
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      return oBundle.getText(sKey, aArgs);
    },

    /**
     * JSON'u guvenli stringify: buyuk veri icin truncate
     */
    _safeStringify: function (obj) {
      if (!obj) return null;
      if (typeof obj === "string") return obj;
      if (typeof obj !== "object") return String(obj);
      if (Array.isArray(obj) && obj.length === 0) return null;
      if (Object.keys(obj).length === 0) return null;
      try {
        var s = JSON.stringify(obj, null, 2);
        if (s.length > MAX_JSON_DISPLAY) {
          return s.substring(0, MAX_JSON_DISPLAY) + "\n\n... (" + Math.round(s.length / 1024) + " KB - truncated)";
        }
        return s;
      } catch (e) {
        return "[JSON stringify error: " + e.message + "]";
      }
    },

    _loadData: function () {
      var that = this;
      API.get("/api/transactions", { limit: 100 }).then(function (result) {
        var aData = (result.data || []).map(function (tx) {
          tx.started_at_fmt = tx.started_at ? new Date(tx.started_at).toLocaleString("tr-TR") : "";
          tx.correlation_ref = tx.correlation_id ? tx.correlation_id.substring(0, 8).toUpperCase() : "";
          tx._actionText = getActionLabel(tx.action);
          return tx;
        });
        var iTotal = result.count || aData.length;
        that._oModel.setProperty("/data", aData);
        that._oModel.setProperty("/count", aData.length);
        that._oModel.setProperty("/totalCount", iTotal);
        that._oModel.setProperty("/countText",
          iTotal > aData.length
            ? that._getText("txTransactionCount", [aData.length]) + " / " + iTotal
            : that._getText("txTransactionCount", [aData.length]));
        that._buildActionOptions(aData);
        that._applyFilters();
      });
    },

    _buildActionOptions: function (aData) {
      var oActions = {};
      aData.forEach(function (tx) {
        if (tx.action && !oActions[tx.action]) {
          oActions[tx.action] = true;
        }
      });
      var aOptions = [{ key: "ALL", text: this._getText("txAllActions") }];
      Object.keys(oActions).sort().forEach(function (sAction) {
        aOptions.push({ key: sAction, text: sAction });
      });
      this._oModel.setProperty("/actionOptions", aOptions);
    },

    _applyFilters: function () {
      var oTable = this.byId("txTable");
      if (!oTable) { return; }
      var oBinding = oTable.getBinding("items");
      if (!oBinding) { return; }

      var aFilters = [];

      var oActionFilter = this.byId("actionFilter");
      if (oActionFilter) {
        var sAction = oActionFilter.getSelectedKey();
        if (sAction && sAction !== "ALL") {
          aFilters.push(new Filter("action", FilterOperator.EQ, sAction));
        }
      }

      var oDirectionFilter = this.byId("directionFilter");
      if (oDirectionFilter) {
        var sDirection = oDirectionFilter.getSelectedKey();
        if (sDirection && sDirection !== "ALL") {
          aFilters.push(new Filter("direction", FilterOperator.EQ, sDirection));
        }
      }

      var oStatusFilter = this.byId("statusFilter");
      if (oStatusFilter) {
        var sStatus = oStatusFilter.getSelectedKey();
        if (sStatus && sStatus !== "ALL") {
          aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
        }
      }

      if (this._sSearchQuery) {
        aFilters.push(new Filter({
          filters: [
            new Filter("action", FilterOperator.Contains, this._sSearchQuery),
            new Filter("sap_function", FilterOperator.Contains, this._sSearchQuery),
            new Filter("delivery_no", FilterOperator.Contains, this._sSearchQuery),
            new Filter("correlation_ref", FilterOperator.Contains, this._sSearchQuery)
          ],
          and: false
        }));
      }

      oBinding.filter(aFilters.length > 0 ? new Filter({ filters: aFilters, and: true }) : []);

      var iFiltered = oBinding.getLength();
      this._oModel.setProperty("/countText", this._getText("txTransactionCount", [iFiltered]));
    },

    onRefresh: function () { this._loadData(); },
    onFilterChange: function () { this._applyFilters(); },

    onSearch: function (oEvent) {
      this._sSearchQuery = oEvent.getParameter("newValue") || "";
      this._applyFilters();
    },

    onTxPress: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("txLog");
      if (!oCtx) { return; }
      var oTx = this._oModel.getProperty(oCtx.getPath());
      if (!oTx) { return; }
      this._showDetailDialog(oTx);
    },

    _showDetailDialog: function (oTx) {
      var that = this;
      var _step = "init";
      try {
        _step = "stringify";
        var sRequestJson = this._safeStringify(oTx.sap_request) || "\u2014 Bo\u015f \u2014";
        var sResponseJson = this._safeStringify(oTx.sap_response) || "\u2014 Bo\u015f \u2014";

        var sDirection = String(oTx.direction || "");
        var sStatus = String(oTx.status || "");
        var sDirectionState = sDirection === "INBOUND" ? "Information" : "Warning";
        var sStatusState = sStatus === "SUCCESS" ? "Success" : (sStatus === "FAILED" || sStatus === "DEAD") ? "Error" : sStatus === "RETRYING" ? "Warning" : "None";
        var sDirectionIcon = sDirection === "INBOUND" ? "sap-icon://incoming-call" : "sap-icon://outgoing-call";
        var sStatusIcon = sStatusState === "Success" ? "sap-icon://message-success" : sStatusState === "Error" ? "sap-icon://message-error" : sStatusState === "Warning" ? "sap-icon://message-warning" : "";

        _step = "general-items";
        var aItems = [
          new HBox({ items: [new Label({ text: that._getText("txAction") + ":", width: "140px" }), new Text({ text: String(oTx.action || "\u2014") })] }),
          new HBox({ items: [new Label({ text: that._getText("txDirection") + ":", width: "140px" }), new ObjectStatus({ text: sDirection || "\u2014", state: sDirectionState, icon: sDirectionIcon })] }),
          new HBox({ items: [new Label({ text: that._getText("txStatus") + ":", width: "140px" }), new ObjectStatus({ text: sStatus || "\u2014", state: sStatusState, icon: sStatusIcon })] }),
          new HBox({ items: [new Label({ text: that._getText("txSAPFunction") + ":", width: "140px" }), new Text({ text: String(oTx.sap_function || "\u2014") })] }),
          new HBox({ items: [new Label({ text: that._getText("txSAPDoc") + ":", width: "140px" }), new Text({ text: String(oTx.sap_doc_number || "\u2014") })] }),
          new HBox({ items: [new Label({ text: that._getText("txDuration") + ":", width: "140px" }), new Text({ text: (oTx.duration_ms || 0) + " ms" })] }),
          new HBox({ items: [new Label({ text: that._getText("txStarted") + ":", width: "140px" }), new Text({ text: oTx.started_at ? new Date(oTx.started_at).toLocaleString("tr-TR") : "\u2014" })] }),
          new HBox({ items: [new Label({ text: that._getText("txCompletedAt") + ":", width: "140px" }), new Text({ text: oTx.completed_at ? new Date(oTx.completed_at).toLocaleString("tr-TR") : "\u2014" })] }),
          new HBox({ items: [new Label({ text: that._getText("txError") + ":", width: "140px" }), new Text({ text: String(oTx.error_message || "\u2014") })] })
        ];

        _step = "correlation";
        if (oTx.correlation_ref) {
          aItems.splice(1, 0, new HBox({ items: [
            new Label({ text: that._getText("txCorrelationRef") + ":", width: "140px" }),
            new ObjectStatus({ text: String(oTx.correlation_ref), state: "Information", icon: "sap-icon://chain-link" })
          ]}));
        }

        _step = "general-vbox";
        var oGeneralContent = new VBox({ items: aItems });
        oGeneralContent.addStyleClass("sapUiSmallMargin");

        _step = "request-editor";
        var oRequestEditor = new TextArea({ rows: 16, width: "100%", editable: false, growing: true, growingMaxLines: 30 });
        oRequestEditor.setValue(sRequestJson);
        oRequestEditor.addStyleClass("sapUiTinyMargin");

        _step = "response-editor";
        var oResponseEditor = new TextArea({ rows: 16, width: "100%", editable: false, growing: true, growingMaxLines: 30 });
        oResponseEditor.setValue(sResponseJson);
        oResponseEditor.addStyleClass("sapUiTinyMargin");

        _step = "chain-container";
        var oChainContainer = new VBox({});
        oChainContainer.addStyleClass("sapUiSmallMargin");
        var bChainLoaded = false;

        _step = "tabbar";
        var oTabBar = new IconTabBar({
          stretchContentHeight: true,
          select: function (oEvt) {
            if (oEvt.getParameter("key") === "chain" && !bChainLoaded) {
              bChainLoaded = true;
              that._loadChainTab(oTx, oChainContainer);
            }
          },
          items: [
            new IconTabFilter({ key: "general", text: that._getText("txGeneral"), icon: "sap-icon://detail-view", content: [oGeneralContent] }),
            new IconTabFilter({ key: "request", text: that._getText("txRequest"), icon: "sap-icon://incoming-call", content: [oRequestEditor] }),
            new IconTabFilter({ key: "response", text: that._getText("txResponse"), icon: "sap-icon://outgoing-call", content: [oResponseEditor] }),
            new IconTabFilter({ key: "chain", text: that._getText("txChain"), icon: "sap-icon://process", content: [oChainContainer] })
          ]
        });

        _step = "dialog-create";
        var oDialog = new Dialog({
          title: that._getText("txDetailTitle") + " \u2014 " + String(oTx.action || ""),
          icon: "",
          contentWidth: "760px",
          contentHeight: "500px",
          resizable: true,
          draggable: true,
          content: [oTabBar],
          endButton: new Button({ text: "Kapat", press: function () { oDialog.close(); } }),
          afterClose: function () { oDialog.destroy(); }
        });

        _step = "dialog-open";
        oDialog.open();
      } catch (e) {
        MessageBox.error("Dialog hatas\u0131 [" + _step + "]: " + e.message);
      }
    },

    _loadChainTab: function (oTx, oContainer) {
      var that = this;

      if (!oTx.correlation_id) {
        oContainer.addItem(new MessageStrip({
          text: that._getText("txChainNoChain"),
          type: "Information",
          showIcon: true
        }));
        return;
      }

      var oBusy = new BusyIndicator({ size: "32px" });
      oContainer.addItem(oBusy);

      API.get("/api/transactions/" + oTx.id + "/chain").then(function (result) {
        oContainer.removeItem(oBusy);
        oBusy.destroy();

        var aChain = result.data || [];
        if (aChain.length === 0) {
          oContainer.addItem(new MessageStrip({
            text: that._getText("txChainNoChain"),
            type: "Information",
            showIcon: true
          }));
          return;
        }

        var sRef = oTx.correlation_id.substring(0, 8).toUpperCase();
        var oRefBox = new HBox({ items: [
          new Label({ text: that._getText("txCorrelationRef") + ":", width: "140px", design: "Bold" }),
          new ObjectStatus({ text: sRef, state: "Information", icon: "sap-icon://chain-link" })
        ]});
        oRefBox.addStyleClass("sapUiTinyMarginBottom");
        oContainer.addItem(oRefBox);

        aChain.forEach(function (step, idx) {
          var sStepStatus = String(step.status || "");
          var sStepState = sStepStatus === "SUCCESS" ? "Success" : sStepStatus === "FAILED" ? "Error" : "Warning";
          var sStepDirection = String(step.direction || "");
          var sStepDirIcon = sStepDirection === "INBOUND" ? "sap-icon://incoming-call" : "sap-icon://outgoing-call";
          var sStepDirLabel = sStepDirection === "INBOUND"
            ? that._getText("txChainSAPtoCockpit")
            : that._getText("txChainCockpitto3PL");
          var sStepStatusIcon = sStepState === "Success" ? "sap-icon://message-success" : sStepState === "Error" ? "sap-icon://message-error" : "sap-icon://message-warning";

          var oStepBox = new VBox({});
          oStepBox.addStyleClass("sapUiSmallMarginBottom sapUiSmallMarginTop");

          var oStepHeader = new HBox({ alignItems: "Center", items: [
            new ObjectStatus({
              text: that._getText("txChainStep") + " " + (idx + 1) + ": " + sStepDirLabel,
              state: sStepState,
              icon: sStepDirIcon
            })
          ]});
          oStepHeader.addStyleClass("sapUiTinyMarginBottom");
          oStepBox.addItem(oStepHeader);

          var oDetails = new VBox({});
          oDetails.addStyleClass("sapUiSmallMarginBegin");
          oDetails.addItem(new HBox({ items: [
            new Label({ text: that._getText("txAction") + ":", width: "120px" }),
            new Text({ text: String(step.action || "\u2014") })
          ]}));
          oDetails.addItem(new HBox({ items: [
            new Label({ text: that._getText("txChainTarget") + ":", width: "120px" }),
            new Text({ text: String(step.sap_function || "\u2014") })
          ]}));
          oDetails.addItem(new HBox({ items: [
            new Label({ text: that._getText("txStatus") + ":", width: "120px" }),
            new ObjectStatus({ text: sStepStatus || "\u2014", state: sStepState, icon: sStepStatusIcon })
          ]}));
          oDetails.addItem(new HBox({ items: [
            new Label({ text: that._getText("txChainDuration") + ":", width: "120px" }),
            new Text({ text: (step.duration_ms || 0) + " ms" })
          ]}));
          oDetails.addItem(new HBox({ items: [
            new Label({ text: that._getText("txChainTimestamp") + ":", width: "120px" }),
            new Text({ text: step.started_at ? new Date(step.started_at).toLocaleString("tr-TR") : "\u2014" })
          ]}));
          if (step.error_message) {
            oDetails.addItem(new HBox({ items: [
              new Label({ text: that._getText("txError") + ":", width: "120px" }),
              new Text({ text: String(step.error_message) })
            ]}));
          }

          oStepBox.addItem(oDetails);

          if (idx < aChain.length - 1) {
            var oArrow = new VBox({ items: [new Text({ text: "\u2502" }), new Text({ text: "\u25BC" })] });
            oArrow.addStyleClass("sapUiTinyMarginTop");
            oStepBox.addItem(oArrow);
          }

          oContainer.addItem(oStepBox);
        });
      });
    }
  });
});
