sap.ui.define([
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/TextArea",
  "sap/m/Select",
  "sap/m/MultiComboBox",
  "sap/m/DateTimePicker",
  "sap/m/Text",
  "sap/m/VBox",
  "sap/m/HBox",
  "sap/m/MessageStrip",
  "sap/m/FormattedText",
  "sap/ui/core/Item",
  "sap/ui/layout/form/SimpleForm",
  "com/redigo/logistics/cockpit/util/API"
], function (MessageToast, MessageBox, Dialog, Button, Label, Input, TextArea, Select, MultiComboBox, DateTimePicker, Text, VBox, HBox, MessageStrip, FormattedText, Item, SimpleForm, API) {
  "use strict";

  return {

    /**
     * Servis kullanıcı oluştur/düzenle dialog'u
     */
    _openServiceUserDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("suEditUser") : this._getText("suAddUser");

      var oName = new Input({
        value: bEdit ? (oExisting.name || "") : "",
        placeholder: "SAP Integration User"
      });

      var oDescription = new TextArea({
        value: bEdit ? (oExisting.description || "") : "",
        rows: 2,
        placeholder: this._getText("suDescription")
      });

      var oScopes = new MultiComboBox({
        selectedKeys: bEdit ? (oExisting.scopes || []) : ["read", "write"],
        items: [
          new Item({ key: "read", text: "read" }),
          new Item({ key: "write", text: "write" }),
          new Item({ key: "webhook", text: "webhook" }),
          new Item({ key: "admin", text: "admin" })
        ]
      });

      var oActive = new Select({ selectedKey: bEdit ? String(oExisting.is_active) : "true" });
      oActive.addItem(new Item({ key: "true", text: this._getText("cfgActiveYes") }));
      oActive.addItem(new Item({ key: "false", text: this._getText("cfgActiveNo") }));

      var oExpiresAt = new DateTimePicker({
        value: bEdit && oExisting.expires_at ? oExisting.expires_at : "",
        valueFormat: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        displayFormat: "dd.MM.yyyy HH:mm",
        placeholder: this._getText("suExpiresAt")
      });

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0,
        columnsXL: 1, columnsL: 1, columnsM: 1,
        content: [
          new Label({ text: this._getText("suName"), required: true }), oName,
          new Label({ text: this._getText("suDescription") }), oDescription,
          new Label({ text: this._getText("suScopes"), required: true }), oScopes,
          new Label({ text: this._getText("cfgActive") }), oActive,
          new Label({ text: this._getText("suExpiresAt") }), oExpiresAt
        ]
      });

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "520px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var sName = oName.getValue().trim();
            var aScopes = oScopes.getSelectedKeys();
            if (!sName || aScopes.length === 0) {
              MessageBox.error(that._getText("msgRequiredFields"));
              return;
            }

            var oPayload = {
              name: sName,
              description: oDescription.getValue().trim() || null,
              scopes: aScopes,
              is_active: oActive.getSelectedKey() === "true",
              expires_at: oExpiresAt.getValue() || null
            };

            var pReq = bEdit
              ? API.put("/api/v1/service-users/" + oExisting.id, oPayload)
              : API.post("/api/v1/service-users", oPayload);

            pReq.then(function (result) {
              if (result.data) {
                MessageToast.show(that._getText("msgSaved"));
                that._loadData();
                oDialog.close();
                // Yeni oluşturmada credentials göster
                if (!bEdit && result.credentials) {
                  that._showCredentialsDialog(result.credentials.api_key, result.credentials.api_secret);
                }
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            }).catch(function (err) {
              var sMsg = that._getText("msgError");
              if (err && err.error && err.error.includes("Maximum 5")) {
                sMsg = that._getText("suLimitReached");
              }
              MessageBox.error(sMsg);
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

    /**
     * Credentials dialog — API key + secret tek seferlik gösterilir
     */
    _showCredentialsDialog: function (sApiKey, sApiSecret) {
      var that = this;

      var oKeyInput = new Input({
        value: sApiKey,
        editable: false,
        width: "100%"
      });
      var oSecretInput = new Input({
        value: sApiSecret,
        editable: false,
        width: "100%"
      });

      var oWarning = new MessageStrip({
        text: this._getText("suCredentialsWarning"),
        type: "Warning",
        showIcon: true,
        showCloseButton: false
      });

      var oContent = new VBox({
        items: [
          oWarning,
          new Label({ text: this._getText("suApiKey") }).addStyleClass("sapUiSmallMarginTop"),
          new HBox({
            items: [
              oKeyInput,
              new Button({
                icon: "sap-icon://copy",
                tooltip: this._getText("suCopyKey"),
                press: function () {
                  navigator.clipboard.writeText(sApiKey).then(function () {
                    MessageToast.show(that._getText("suCopied"));
                  });
                }
              })
            ]
          }),
          new Label({ text: this._getText("suApiSecret") }).addStyleClass("sapUiSmallMarginTop"),
          new HBox({
            items: [
              oSecretInput,
              new Button({
                icon: "sap-icon://copy",
                tooltip: this._getText("suCopySecret"),
                press: function () {
                  navigator.clipboard.writeText(sApiSecret).then(function () {
                    MessageToast.show(that._getText("suCopied"));
                  });
                }
              })
            ]
          })
        ]
      }).addStyleClass("sapUiSmallMargin");

      var oDialog = new Dialog({
        title: this._getText("suCredentialsTitle"),
        contentWidth: "560px",
        type: "Message",
        state: "Warning",
        content: [oContent],
        beginButton: new Button({
          text: "OK",
          type: "Emphasized",
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); },
        escapeHandler: function (oPromise) {
          // ESC ile kapatmayı engelleme — kullanıcı OK'e basmalı
          oPromise.resolve();
        }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onAddServiceUser: function () {
      this._openServiceUserDialog(null);
    },

    onEditServiceUser: function (oEvent) {
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      this._openServiceUserDialog(oItem);
    },

    /**
     * Credentials yenileme
     */
    onRegenerateServiceUser: function (oEvent) {
      var that = this;
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();

      MessageBox.confirm(this._getText("suRegenerateConfirm"), {
        title: this._getText("suRegenerateTooltip"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            API.post("/api/v1/service-users/" + oItem.id + "/regenerate").then(function (result) {
              if (result.credentials) {
                MessageToast.show(that._getText("msgSaved"));
                that._loadData();
                that._showCredentialsDialog(result.credentials.api_key, result.credentials.api_secret);
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            }).catch(function (err) {
              console.error("Service user regenerate error", err);
              MessageBox.error(that._getText("msgError"));
            });
          }
        }
      });
    },

    /**
     * Servis kullanıcı sil (sadece usage_count === 0 ise)
     */
    onDeleteServiceUser: function (oEvent) {
      var that = this;
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();

      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            API.del("/api/v1/service-users/" + oItem.id).then(function (result) {
              if (result.success) {
                MessageToast.show(that._getText("msgDeleted"));
                that._loadData();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            }).catch(function (err) {
              var sMsg = that._getText("msgError");
              if (err && err.error && err.error.includes("usage_count")) {
                sMsg = that._getText("suCannotDelete");
              }
              MessageBox.error(sMsg);
            });
          }
        }
      });
    }
  };
});
