// component/dialog_pwd_input/dialog_pwd_input.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    cancelText: {
      type: String,
      value: '取消'
    },

    confirmText: {
      type: String,
      value: '确定'
    },

    backdrop: {
      type: Boolean,
      value: true
    },
  },

  /**
   * 组件的初始数据
   */
  data: {
    password: ''
  },

  /**
   * 组件的方法列表
   */
  methods: {
    //modal隐藏
    hideModal: function (e) {
      if (e) {
        let type = e.currentTarget.dataset.type;
        if (type == 'mask' && !this.data.backdrop) {
          return;
        }
      }
      if (this.data.isShow) this._toggleModal();
    },

    //modal显示
    showModal: function () {
      if (!this.data.isShow) {
        this._toggleModal();
      }
    },

    //切换modal的显示还是隐藏
    _toggleModal: function () {
      this.setData({
        isShow: !this.data.isShow
      })
    },

    onPasswordInput(e) {
      this.setData({
        password: e.detail.value
      })
    },

    //取消事件 向外部page 发送事件通知
    cancelModal: function () {
      this.hideModal();
      this.triggerEvent("cancelEvent");
    },

    //确认事件
    confirmModal: function () {
      var detail = {
        password: this.data.password,
      }
      this.hideModal();
      this.triggerEvent("confirmEvent", detail);
    }
  }
})
