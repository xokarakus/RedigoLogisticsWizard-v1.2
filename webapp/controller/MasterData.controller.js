sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/Select",
  "sap/m/List",
  "sap/m/StandardListItem",
  "sap/m/Text",
  "sap/ui/core/Item",
  "sap/ui/layout/form/SimpleForm",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, Label, Input, Select, List, StandardListItem, Text, Item, SimpleForm, API) {
  "use strict";

  function fmtDate(val) {
    if (!val) return "";
    try { return new Date(val).toLocaleString("tr-TR"); } catch (e) { return val; }
  }

  return Controller.extend("com.redigo.logistics.cockpit.controller.MasterData", {

    onInit: function () {
      var oModel = new JSONModel({
        materials: [],
        allMaterials: [],
        materialCount: 0,
        partners: [],
        allPartners: [],
        partnerCount: 0
      });
      this.getView().setModel(oModel, "masterData");
      this._loadMaterials();
      this._loadPartners();
    },

    _onBeforeShow: function () {
      this._loadMaterials();
      this._loadPartners();
    },

    /* ═══ Data Loading ═══ */

    _loadMaterials: function () {
      var oModel = this.getView().getModel("masterData");
      API.get("/api/master-data/materials", { limit: 500 }).then(function (res) {
        var data = (res.data || []).map(function (m) {
          m.last_synced_fmt = fmtDate(m.last_synced_at);
          return m;
        });
        oModel.setProperty("/materials", data);
        oModel.setProperty("/allMaterials", data);
        oModel.setProperty("/materialCount", data.length);
      });
    },

    _loadPartners: function () {
      var oModel = this.getView().getModel("masterData");
      API.get("/api/master-data/partners", { limit: 500 }).then(function (res) {
        var data = (res.data || []).map(function (p) {
          p.last_synced_fmt = fmtDate(p.last_synced_at);
          return p;
        });
        oModel.setProperty("/partners", data);
        oModel.setProperty("/allPartners", data);
        oModel.setProperty("/partnerCount", data.length);
      });
    },

    onRefreshMaterials: function () {
      this._loadMaterials();
      MessageToast.show(this._i18n("msgRefreshed"));
    },

    onRefreshPartners: function () {
      this._loadPartners();
      MessageToast.show(this._i18n("msgRefreshed"));
    },

    onTabSelect: function () {
      // no-op, tabs auto-switch
    },

    /* ═══ Search / Filter ═══ */

    onMaterialSearch: function (oEvent) {
      var q = (oEvent.getParameter("newValue") || "").toLowerCase();
      var oModel = this.getView().getModel("masterData");
      var all = oModel.getProperty("/allMaterials");
      var filtered = !q ? all : all.filter(function (m) {
        return (m.sap_material_no || "").toLowerCase().indexOf(q) >= 0 ||
               (m.description || "").toLowerCase().indexOf(q) >= 0 ||
               (m.material_group || "").toLowerCase().indexOf(q) >= 0;
      });
      oModel.setProperty("/materials", filtered);
      oModel.setProperty("/materialCount", filtered.length);
    },

    onPartnerSearch: function (oEvent) {
      var q = (oEvent.getParameter("newValue") || "").toLowerCase();
      this._applyPartnerFilter(q);
    },

    onPartnerTypeFilter: function () {
      this._applyPartnerFilter();
    },

    _applyPartnerFilter: function (searchQuery) {
      var oModel = this.getView().getModel("masterData");
      var all = oModel.getProperty("/allPartners");
      var typeFilter = this.byId("partnerTypeFilter");
      var type = typeFilter ? typeFilter.getSelectedKey() : "ALL";

      if (searchQuery === undefined) {
        // Get current search text from the SearchField
        var aContent = this.byId("partnersTable").getHeaderToolbar().getContent();
        for (var i = 0; i < aContent.length; i++) {
          if (aContent[i].isA && aContent[i].isA("sap.m.SearchField")) {
            searchQuery = (aContent[i].getValue() || "").toLowerCase();
            break;
          }
        }
      }
      var q = (searchQuery || "").toLowerCase();

      var filtered = all.filter(function (p) {
        if (type !== "ALL" && p.partner_type !== type) return false;
        if (q) {
          return (p.sap_partner_no || "").toLowerCase().indexOf(q) >= 0 ||
                 (p.name || "").toLowerCase().indexOf(q) >= 0 ||
                 (p.city || "").toLowerCase().indexOf(q) >= 0;
        }
        return true;
      });
      oModel.setProperty("/partners", filtered);
      oModel.setProperty("/partnerCount", filtered.length);
    },

    /* ═══ Material CRUD ═══ */

    onAddMaterial: function () {
      this._openMaterialDialog(null);
    },

    onEditMaterial: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("masterData");
      this._openMaterialDialog(oCtx.getObject());
    },

    _openMaterialDialog: function (oItem) {
      var that = this;
      var bEdit = !!oItem;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      var oMatNo = new Input({ value: bEdit ? oItem.sap_material_no : "", placeholder: "MATNR" });
      var oDesc = new Input({ value: bEdit ? oItem.description : "" });
      var oGroup = new Input({ value: bEdit ? oItem.material_group : "" });
      var oUom = new Input({ value: bEdit ? oItem.base_uom : "EA", placeholder: "EA" });
      var oWeight = new Input({ value: bEdit ? oItem.gross_weight : "", type: "Number" });
      var oWeightUnit = new Input({ value: bEdit ? oItem.weight_unit : "", placeholder: "KG" });

      var oDialog = new Dialog({
        title: bEdit ? oBundle.getText("mdEditMaterial") : oBundle.getText("mdAddMaterial"),
        contentWidth: "420px",
        content: [
          new SimpleForm({ editable: true, layout: "ResponsiveGridLayout", labelSpanL: 4, labelSpanM: 4, content: [
            new Label({ text: oBundle.getText("mdMaterialNo"), required: true }), oMatNo,
            new Label({ text: oBundle.getText("mdDescription") }), oDesc,
            new Label({ text: oBundle.getText("mdMaterialGroup") }), oGroup,
            new Label({ text: oBundle.getText("mdBaseUom") }), oUom,
            new Label({ text: oBundle.getText("mdGrossWeight") }), oWeight,
            new Label({ text: oBundle.getText("mdWeightUnit") }), oWeightUnit
          ]})
        ],
        beginButton: new Button({
          text: oBundle.getText("cfgSave"), type: "Emphasized",
          press: function () {
            var sMatNo = oMatNo.getValue().trim();
            if (!sMatNo) {
              MessageToast.show(oBundle.getText("msgRequiredFields"));
              return;
            }
            var payload = {
              sap_material_no: sMatNo,
              description: oDesc.getValue().trim(),
              material_group: oGroup.getValue().trim(),
              base_uom: oUom.getValue().trim() || "EA",
              gross_weight: parseFloat(oWeight.getValue()) || 0,
              weight_unit: oWeightUnit.getValue().trim()
            };
            var prom = bEdit
              ? API.put("/api/master-data/materials/" + oItem.id, payload)
              : API.post("/api/master-data/materials", payload);
            prom.then(function () {
              MessageToast.show(oBundle.getText("msgSaved"));
              that._loadMaterials();
              oDialog.close();
            });
          }
        }),
        endButton: new Button({
          text: oBundle.getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      oDialog.open();
    },

    onDeleteMaterial: function (oEvent) {
      var that = this;
      var oCtx = oEvent.getSource().getBindingContext("masterData");
      var oItem = oCtx.getObject();
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      MessageBox.confirm(oBundle.getText("msgConfirmDelete"), {
        title: oBundle.getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            API.del("/api/master-data/materials/" + oItem.id).then(function () {
              MessageToast.show(oBundle.getText("msgDeleted"));
              that._loadMaterials();
            });
          }
        }
      });
    },

    /* ═══ Partner CRUD ═══ */

    onAddPartner: function () {
      this._openPartnerDialog(null);
    },

    onEditPartner: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("masterData");
      this._openPartnerDialog(oCtx.getObject());
    },

    _openPartnerDialog: function (oItem) {
      var that = this;
      var bEdit = !!oItem;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      var oPartnerNo = new Input({ value: bEdit ? oItem.sap_partner_no : "", placeholder: "KUNNR / LIFNR" });
      var oType = new Select({
        selectedKey: bEdit ? oItem.partner_type : "CUSTOMER",
        items: [
          new Item({ key: "CUSTOMER", text: oBundle.getText("mdCustomer") }),
          new Item({ key: "VENDOR", text: oBundle.getText("mdVendor") })
        ]
      });
      var oName = new Input({ value: bEdit ? oItem.name : "" });
      var oCity = new Input({ value: bEdit ? oItem.city : "" });
      var oCountry = new Input({ value: bEdit ? oItem.country : "TR", placeholder: "TR" });

      var oDialog = new Dialog({
        title: bEdit ? oBundle.getText("mdEditPartner") : oBundle.getText("mdAddPartner"),
        contentWidth: "420px",
        content: [
          new SimpleForm({ editable: true, layout: "ResponsiveGridLayout", labelSpanL: 4, labelSpanM: 4, content: [
            new Label({ text: oBundle.getText("mdPartnerNo"), required: true }), oPartnerNo,
            new Label({ text: oBundle.getText("mdPartnerType") }), oType,
            new Label({ text: oBundle.getText("mdName") }), oName,
            new Label({ text: oBundle.getText("mdCity") }), oCity,
            new Label({ text: oBundle.getText("mdCountry") }), oCountry
          ]})
        ],
        beginButton: new Button({
          text: oBundle.getText("cfgSave"), type: "Emphasized",
          press: function () {
            var sNo = oPartnerNo.getValue().trim();
            if (!sNo) {
              MessageToast.show(oBundle.getText("msgRequiredFields"));
              return;
            }
            var payload = {
              sap_partner_no: sNo,
              partner_type: oType.getSelectedKey(),
              name: oName.getValue().trim(),
              city: oCity.getValue().trim(),
              country: oCountry.getValue().trim() || "TR"
            };
            var prom = bEdit
              ? API.put("/api/master-data/partners/" + oItem.id, payload)
              : API.post("/api/master-data/partners", payload);
            prom.then(function () {
              MessageToast.show(oBundle.getText("msgSaved"));
              that._loadPartners();
              oDialog.close();
            });
          }
        }),
        endButton: new Button({
          text: oBundle.getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      oDialog.open();
    },

    onDeletePartner: function (oEvent) {
      var that = this;
      var oCtx = oEvent.getSource().getBindingContext("masterData");
      var oItem = oCtx.getObject();
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      MessageBox.confirm(oBundle.getText("msgConfirmDelete"), {
        title: oBundle.getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            API.del("/api/master-data/partners/" + oItem.id).then(function () {
              MessageToast.show(oBundle.getText("msgDeleted"));
              that._loadPartners();
            });
          }
        }
      });
    },

    /* ═══ 3PL Dispatch ═══ */

    onDispatchMaterials: function () {
      this._dispatchTo3PL("materials", "materialsTable");
    },

    onDispatchPartners: function () {
      this._dispatchTo3PL("partners", "partnersTable");
    },

    _dispatchTo3PL: function (sType, sTableId) {
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      var oTable = this.byId(sTableId);
      var aSelected = oTable.getSelectedItems();

      if (aSelected.length === 0) {
        MessageToast.show(oBundle.getText("mdSelectRecords"));
        return;
      }

      var aIds = aSelected.map(function (oItem) {
        return oItem.getBindingContext("masterData").getObject().id;
      });

      // Mapping profillerini çek
      API.get("/api/master-data/mappings").then(function (res) {
        var aMappings = res.data || [];

        if (aMappings.length === 0) {
          MessageBox.warning(oBundle.getText("mdNoMapping"));
          return;
        }

        // Profil seçim dialog'u
        var oMappingSelect = new Select({
          width: "100%",
          items: aMappings.map(function (m) {
            var sText = (m.company_code || "") + " — " + (m.description || m.process_type || "");
            return new Item({ key: m.id, text: sText });
          })
        });

        var oDialog = new Dialog({
          title: oBundle.getText("mdSelectMapping"),
          contentWidth: "450px",
          content: [
            new SimpleForm({ editable: true, layout: "ResponsiveGridLayout", labelSpanL: 4, labelSpanM: 4, content: [
              new Label({ text: oBundle.getText("mdMappingProfile") }), oMappingSelect,
              new Label({ text: "" }),
              new Text({ text: oBundle.getText("mdDispatchConfirm", [aIds.length, oMappingSelect.getSelectedItem() ? oMappingSelect.getSelectedItem().getText() : ""]) })
            ]})
          ],
          beginButton: new Button({
            text: oBundle.getText("mdDispatch"), type: "Emphasized", icon: "sap-icon://upload-to-cloud",
            press: function () {
              oDialog.close();
              that._executeDispatch(sType, aIds, oMappingSelect.getSelectedKey(), sTableId);
            }
          }),
          endButton: new Button({
            text: oBundle.getText("cfgCancel"),
            press: function () { oDialog.close(); }
          }),
          afterClose: function () { oDialog.destroy(); }
        });

        oDialog.open();
      });
    },

    _executeDispatch: function (sType, aIds, sMappingId, sTableId) {
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      sap.ui.core.BusyIndicator.show(0);

      API.post("/api/master-data/dispatch", {
        type: sType,
        ids: aIds,
        mapping_id: sMappingId
      }).then(function (res) {
        sap.ui.core.BusyIndicator.hide();

        var sMsg = oBundle.getText("mdDispatchSuccess", [res.success || 0]);
        if (res.failed > 0) {
          sMsg += "\n" + oBundle.getText("mdDispatchFailed", [res.failed]);
        }

        // Sonuç detayları
        var aResults = res.results || [];
        var sDetail = aResults.map(function (r) {
          var icon = r.status === "SUCCESS" ? "\u2705" : "\u274C";
          return icon + " " + r.sap_no + (r.error ? " — " + r.error : "");
        }).join("\n");

        MessageBox.show(sMsg + "\n\n" + sDetail, {
          title: oBundle.getText("mdDispatchResult"),
          icon: res.failed > 0 ? MessageBox.Icon.WARNING : MessageBox.Icon.SUCCESS
        });

        // Tabloyu yenile + seçimi temizle
        var oTable = that.byId(sTableId);
        if (oTable) oTable.removeSelections(true);
        if (sType === "materials") {
          that._loadMaterials();
        } else {
          that._loadPartners();
        }
      }).catch(function (err) {
        sap.ui.core.BusyIndicator.hide();
        MessageBox.error(err.message || String(err));
      });
    },

    /* ═══ Helpers ═══ */

    _i18n: function (sKey) {
      return this.getView().getModel("i18n").getResourceBundle().getText(sKey);
    }
  });
});
