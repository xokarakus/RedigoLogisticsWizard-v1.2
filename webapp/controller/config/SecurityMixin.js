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
    _openSecurityDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("spEditProfile") : this._getText("spAddProfile");

      var oCompany = new Select({ selectedKey: bEdit ? oExisting.company_code : "" });
      var aWhSP = this._oModel.getProperty("/warehouses") || [];
      var seenSP = {};
      aWhSP.forEach(function (w) {
        if (w.company_code && !seenSP[w.company_code]) {
          oCompany.addItem(new Item({ key: w.company_code, text: w.company_code }));
          seenSP[w.company_code] = true;
        }
      });
      if (bEdit && oExisting.company_code && !seenSP[oExisting.company_code]) {
        oCompany.insertItem(new Item({ key: oExisting.company_code, text: oExisting.company_code }), 0);
      }
      var oAuthType = new Select({ selectedKey: bEdit ? oExisting.auth_type : "OAUTH2" });
      oAuthType.addItem(new Item({ key: "OAUTH2", text: "OAuth 2.0" }));
      oAuthType.addItem(new Item({ key: "API_KEY", text: "API Key" }));
      oAuthType.addItem(new Item({ key: "BASIC", text: "Basic Auth" }));
      oAuthType.addItem(new Item({ key: "BEARER", text: "Bearer Token" }));
      var oEnvironment = new Select({ selectedKey: bEdit ? oExisting.environment : "QAS" });
      oEnvironment.addItem(new Item({ key: "PROD", text: "PROD" }));
      oEnvironment.addItem(new Item({ key: "QAS", text: "QAS" }));
      oEnvironment.addItem(new Item({ key: "DEV", text: "DEV" }));

      var oConfig = bEdit ? (oExisting.config || {}) : {};

      var oClientId = new Input({ value: oConfig.client_id || "", placeholder: "client_id" });
      var oClientSecret = new Input({ value: oConfig.client_secret || "", placeholder: "***", type: "Password" });
      var oTokenUrl = new Input({ value: oConfig.token_url || "", placeholder: "https://auth.example.com/token" });
      var oScope = new Input({ value: oConfig.scope || "", placeholder: "wms.read wms.write" });
      var oApiKey = new Input({ value: oConfig.api_key || "", placeholder: "***", type: "Password" });
      var oHeaderName = new Input({ value: oConfig.header_name || "X-API-Key", placeholder: "X-API-Key" });
      var oUsername = new Input({ value: oConfig.username || "" });
      var oPassword = new Input({ value: oConfig.password || "", type: "Password" });
      var oBearerToken = new Input({ value: oConfig.token || "", placeholder: "eyJhbGciOiJSUzI1NiIs...", type: "Password" });

      var oActive = new Select({ selectedKey: bEdit ? String(oExisting.is_active) : "true" });
      oActive.addItem(new Item({ key: "true", text: this._getText("cfgActiveYes") }));
      oActive.addItem(new Item({ key: "false", text: this._getText("cfgActiveNo") }));

      var oLblClientId = new Label({ text: this._getText("spClientId") });
      var oLblClientSecret = new Label({ text: this._getText("spClientSecret") });
      var oLblTokenUrl = new Label({ text: this._getText("spTokenUrl") });
      var oLblScope = new Label({ text: this._getText("spScope") });
      var oLblApiKey = new Label({ text: this._getText("spApiKey") });
      var oLblHeaderName = new Label({ text: this._getText("spHeaderName") });
      var oLblUsername = new Label({ text: this._getText("spUsername") });
      var oLblPassword = new Label({ text: this._getText("spPassword") });
      var oLblBearerToken = new Label({ text: this._getText("spBearerToken") });

      var fnToggle = function () {
        var sType = oAuthType.getSelectedKey();
        var bOAuth = sType === "OAUTH2";
        var bApiKey2 = sType === "API_KEY";
        var bBasic = sType === "BASIC";
        var bBearer = sType === "BEARER";
        oLblClientId.setVisible(bOAuth); oClientId.setVisible(bOAuth);
        oLblClientSecret.setVisible(bOAuth); oClientSecret.setVisible(bOAuth);
        oLblTokenUrl.setVisible(bOAuth); oTokenUrl.setVisible(bOAuth);
        oLblScope.setVisible(bOAuth); oScope.setVisible(bOAuth);
        oLblApiKey.setVisible(bApiKey2); oApiKey.setVisible(bApiKey2);
        oLblHeaderName.setVisible(bApiKey2); oHeaderName.setVisible(bApiKey2);
        oLblUsername.setVisible(bBasic); oUsername.setVisible(bBasic);
        oLblPassword.setVisible(bBasic); oPassword.setVisible(bBasic);
        oLblBearerToken.setVisible(bBearer); oBearerToken.setVisible(bBearer);
      };
      oAuthType.attachChange(fnToggle);

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0,
        columnsXL: 1, columnsL: 1, columnsM: 1,
        content: [
          new Label({ text: this._getText("spCompanyCode"), required: true }), oCompany,
          new Label({ text: this._getText("spAuthType"), required: true }), oAuthType,
          new Label({ text: this._getText("spEnvironment"), required: true }), oEnvironment,
          oLblClientId, oClientId,
          oLblClientSecret, oClientSecret,
          oLblTokenUrl, oTokenUrl,
          oLblScope, oScope,
          oLblApiKey, oApiKey,
          oLblHeaderName, oHeaderName,
          oLblUsername, oUsername,
          oLblPassword, oPassword,
          oLblBearerToken, oBearerToken,
          new Label({ text: this._getText("cfgActive") }), oActive
        ]
      });

      fnToggle();

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "550px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var sType = oAuthType.getSelectedKey();
            var oConfigPayload = {};
            if (sType === "OAUTH2") {
              oConfigPayload = {
                client_id: oClientId.getValue().trim(),
                client_secret: oClientSecret.getValue().trim(),
                token_url: oTokenUrl.getValue().trim(),
                scope: oScope.getValue().trim()
              };
            } else if (sType === "API_KEY") {
              oConfigPayload = {
                api_key: oApiKey.getValue().trim(),
                header_name: oHeaderName.getValue().trim()
              };
            } else if (sType === "BASIC") {
              oConfigPayload = {
                username: oUsername.getValue().trim(),
                password: oPassword.getValue().trim()
              };
            } else if (sType === "BEARER") {
              oConfigPayload = {
                token: oBearerToken.getValue().trim()
              };
            }
            var oPayload = {
              company_code: oCompany.getSelectedKey(),
              auth_type: sType,
              environment: oEnvironment.getSelectedKey(),
              config: oConfigPayload,
              is_active: oActive.getSelectedKey() === "true"
            };
            if (!oPayload.company_code) {
              MessageBox.error(that._getText("msgRequiredFields"));
              return;
            }
            var pReq = bEdit
              ? API.put("/api/config/security-profiles/" + oExisting.id, oPayload)
              : API.post("/api/config/security-profiles", oPayload);
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

    onAddSecurity: function () { this._openSecurityDialog(null); },

    onEditSecurity: function (oEvent) {
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      this._openSecurityDialog(oItem);
    },

    onDeleteSecurity: function (oEvent) {
      var that = this;
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            API.del("/api/config/security-profiles/" + oItem.id).then(function (result) {
              if (result.success) {
                MessageToast.show(that._getText("msgDeleted"));
                that._loadData();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }
      });
    }
  };
});
