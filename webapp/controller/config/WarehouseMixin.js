sap.ui.define([
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/Select",
  "sap/ui/core/Item",
  "sap/ui/layout/form/SimpleForm",
  "com/redigo/logistics/cockpit/util/API"
], function (MessageToast, MessageBox, Dialog, Button, Label, Input, Select, Item, SimpleForm, API) {
  "use strict";

  return {
    _openWarehouseDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("cfgEditWarehouse") : this._getText("cfgAddWarehouse");

      var oCode = new Input({ value: bEdit ? oExisting.code : "", placeholder: "WH-IST-01" });
      var oName = new Input({ value: bEdit ? oExisting.name : "" });
      var oPlant = new Input({ value: bEdit ? oExisting.sap_plant : "", placeholder: "1000" });
      var oSLoc = new Input({ value: bEdit ? oExisting.sap_stor_loc : "", placeholder: "0001" });
      var oWmsCode = new Input({ value: bEdit ? oExisting.wms_code : "" });
      var oCompanyCode = new Input({ value: bEdit ? oExisting.company_code : "", placeholder: "ABC_LOG" });
      var oSapPartner = new Input({ value: bEdit ? oExisting.sap_partner_no : "", placeholder: "0000100001" });
      var oActive = new Select({ selectedKey: bEdit ? String(oExisting.is_active) : "true" });
      oActive.addItem(new Item({ key: "true", text: this._getText("cfgActiveYes") }));
      oActive.addItem(new Item({ key: "false", text: this._getText("cfgActiveNo") }));

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0,
        columnsXL: 1, columnsL: 1, columnsM: 1,
        content: [
          new Label({ text: this._getText("cfgCode"), required: true }), oCode,
          new Label({ text: this._getText("cfgName"), required: true }), oName,
          new Label({ text: this._getText("cfgPlant"), required: true }), oPlant,
          new Label({ text: this._getText("cfgStorLoc") }), oSLoc,
          new Label({ text: this._getText("cfgWMSCode") }), oWmsCode,
          new Label({ text: this._getText("cfgCompany"), required: true }), oCompanyCode,
          new Label({ text: this._getText("cfgSapPartner") }), oSapPartner,
          new Label({ text: this._getText("cfgActive") }), oActive
        ]
      });

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "500px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var oPayload = {
              code: oCode.getValue().trim(),
              name: oName.getValue().trim(),
              sap_plant: oPlant.getValue().trim(),
              sap_stor_loc: oSLoc.getValue().trim(),
              wms_code: oWmsCode.getValue().trim(),
              company_code: oCompanyCode.getValue().trim(),
              sap_partner_no: oSapPartner.getValue().trim(),
              is_active: oActive.getSelectedKey() === "true"
            };
            if (!oPayload.code || !oPayload.name || !oPayload.sap_plant) {
              MessageBox.error(that._getText("msgRequiredFields"));
              return;
            }
            var pReq = bEdit
              ? API.put("/api/config/warehouses/" + oExisting.id, oPayload)
              : API.post("/api/config/warehouses", oPayload);
            pReq.then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._loadData();
                oDialog.close();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onAddWarehouse: function () { this._openWarehouseDialog(null); },

    onEditWarehouse: function (oEvent) {
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      this._openWarehouseDialog(oItem);
    }
  };
});
