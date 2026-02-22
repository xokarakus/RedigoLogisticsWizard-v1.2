sap.ui.define([
  "sap/ui/core/UIComponent"
], function (UIComponent) {
  "use strict";

  return UIComponent.extend("com.redigo.logistics.cockpit.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
    },

    showView: function (sKey, oContext) {
      this._navContext = oContext || null;
      var oRootView = this.getRootControl();
      if (oRootView && oRootView.getController()) {
        oRootView.getController()._showView(sKey);
      }
    },

    getNavContext: function () {
      return this._navContext;
    }
  });
});
