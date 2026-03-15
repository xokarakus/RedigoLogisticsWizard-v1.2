sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Input",
  "sap/m/Label",
  "sap/m/MessageStrip",
  "sap/m/VBox",
  "sap/ui/model/resource/ResourceModel",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, Dialog, Button, Input, Label, MessageStrip, VBox, ResourceModel, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.Login", {

    onInit: function () {
      // Detect stored or OS language
      var sLang = localStorage.getItem("redigo_language") || this._detectOSLanguage();

      this._oModel = new JSONModel({
        email: "",
        password: "",
        busy: false,
        errorVisible: false,
        errorText: "",
        language: sLang
      });
      this.getView().setModel(this._oModel, "login");

      // Focus email input
      var that = this;
      setTimeout(function () {
        var oInput = that.byId("emailInput");
        if (oInput) { oInput.focus(); }
      }, 500);
    },

    _detectOSLanguage: function () {
      var aSupported = ["tr", "en", "de", "fr", "es"];
      var sBrowserLang = (navigator.language || navigator.userLanguage || "en").toLowerCase();
      // "tr-TR" -> "tr", "de-DE" -> "de"
      var sShort = sBrowserLang.split("-")[0];
      if (aSupported.indexOf(sShort) >= 0) {
        return sShort;
      }
      return "en";
    },

    onLanguageChange: function (oEvent) {
      var sLang = oEvent.getParameter("selectedItem").getKey();
      localStorage.setItem("redigo_language", sLang);

      // SAPUI5 dil degistir
      sap.ui.getCore().getConfiguration().setLanguage(sLang);

      // i18n modelini yeniden yukle
      var oNewI18n = new ResourceModel({
        bundleName: "com.redigo.logistics.cockpit.i18n.i18n",
        supportedLocales: ["", "tr", "en", "de", "fr", "es"],
        fallbackLocale: "en"
      });
      this.getView().setModel(oNewI18n, "i18n");

      // Global i18n model de guncelle (index.html'deki)
      if (window._redigoUpdateI18n) {
        window._redigoUpdateI18n(sLang);
      }
    },

    onLogin: function () {
      var sEmail = this._oModel.getProperty("/email").trim();
      var sPassword = this._oModel.getProperty("/password");

      if (!sEmail || !sPassword) {
        var oBundle = this.getView().getModel("i18n").getResourceBundle();
        this._showError(oBundle.getText("loginEmailRequired"));
        return;
      }

      this._oModel.setProperty("/busy", true);
      this._oModel.setProperty("/errorVisible", false);

      var that = this;

      fetch(API._baseUrl + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sEmail, password: sPassword })
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
        })
        .then(function (result) {
          that._oModel.setProperty("/busy", false);

          if (!result.ok) {
            // Hesap kilitli (423 Locked)
            if (result.body.locked) {
              var oBundle = that.getView().getModel("i18n").getResourceBundle();
              var sMsg = oBundle.getText("loginLocked", [result.body.remaining_minutes]);
              that._showError(sMsg);
            } else {
              var oBundle2 = that.getView().getModel("i18n").getResourceBundle();
              that._showError(result.body.error || oBundle2.getText("loginError"));
            }
            return;
          }

          // Token'i kaydet
          API.setToken(result.body.token);

          // Kullanici bilgisini kaydet
          sessionStorage.setItem("redigo_user", JSON.stringify(result.body.user));

          // must_change_password kontrolu
          if (result.body.must_change_password) {
            that._showChangePasswordDialog();
            return;
          }

          // Normal akis: App'i yukle
          if (window._redigoLoadApp) {
            window._redigoLoadApp();
          }
        })
        .catch(function (err) {
          that._oModel.setProperty("/busy", false);
          that._showError("Sunucu ba\u011flant\u0131s\u0131 ba\u015far\u0131s\u0131z: " + err.message);
        });
    },

    onForgotPassword: function () {
      if (window._redigoShowForgotPassword) {
        window._redigoShowForgotPassword();
      }
    },

    _showChangePasswordDialog: function () {
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      var oNewPassInput = new Input({
        type: "Password",
        placeholder: oBundle.getText("newPassword"),
        width: "100%"
      });

      var oConfirmInput = new Input({
        type: "Password",
        placeholder: oBundle.getText("confirmPassword"),
        width: "100%"
      });

      var oMsgStrip = new MessageStrip({
        type: "Warning",
        showIcon: true,
        text: oBundle.getText("mustChangePassword"),
        visible: true
      }).addStyleClass("sapUiSmallMarginBottom");

      var oErrorStrip = new MessageStrip({
        type: "Error",
        showIcon: true,
        visible: false
      }).addStyleClass("sapUiSmallMarginBottom");

      var oDialog = new Dialog({
        title: oBundle.getText("changePasswordTitle"),
        type: "Message",
        contentWidth: "360px",
        content: [
          new VBox({
            items: [
              oMsgStrip,
              oErrorStrip,
              new Label({ text: oBundle.getText("newPassword"), required: true }).addStyleClass("sapUiSmallMarginTop"),
              oNewPassInput,
              new Label({ text: oBundle.getText("confirmPassword"), required: true }).addStyleClass("sapUiSmallMarginTop"),
              oConfirmInput
            ]
          }).addStyleClass("sapUiSmallMargin")
        ],
        beginButton: new Button({
          text: oBundle.getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var sNewPass = oNewPassInput.getValue();
            var sConfirm = oConfirmInput.getValue();

            if (!sNewPass || sNewPass.length < 6) {
              oErrorStrip.setText(oBundle.getText("passwordMinLength"));
              oErrorStrip.setVisible(true);
              return;
            }
            if (sNewPass !== sConfirm) {
              oErrorStrip.setText(oBundle.getText("passwordMismatch"));
              oErrorStrip.setVisible(true);
              return;
            }

            oErrorStrip.setVisible(false);

            fetch(API._baseUrl + "/api/auth/password", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + API.getToken()
              },
              body: JSON.stringify({ new_password: sNewPass, force_change: true })
            })
              .then(function (res) {
                return res.json().then(function (body) {
                  return { ok: res.ok, body: body };
                });
              })
              .then(function (result) {
                if (!result.ok) {
                  oErrorStrip.setText(result.body.error || "Hata olu\u015ftu");
                  oErrorStrip.setVisible(true);
                  return;
                }
                oDialog.close();
                oDialog.destroy();
                if (window._redigoLoadApp) {
                  window._redigoLoadApp();
                }
              })
              .catch(function (err) {
                oErrorStrip.setText("Sunucu hatas\u0131: " + err.message);
                oErrorStrip.setVisible(true);
              });
          }
        }),
        endButton: new Button({
          text: oBundle.getText("logout"),
          press: function () {
            oDialog.close();
            oDialog.destroy();
            API.logout();
          }
        }),
        afterClose: function () {
          oDialog.destroy();
        }
      });

      oDialog.open();
    },

    _showError: function (sText) {
      this._oModel.setProperty("/errorVisible", true);
      this._oModel.setProperty("/errorText", sText);
    }
  });
});
