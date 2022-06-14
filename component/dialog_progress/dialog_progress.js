// component/dialog_progress/dialog_progress.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    backdrop: {
      type: Boolean,
      value: true
    },
    progress:{
      type: Number,
      value: 0
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    
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

