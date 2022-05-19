// component/date_selecter/date_selecter.js
var util = require('../../utils/util.js')

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
    startDate: util.getDefaultStartDate(),
    endDate: util.formatDate(new Date()),
    startTime: util.getDefaultStartTime(),
    endTime: util.formatTime(new Date())
  },

  /**
   * 组件的方法列表
   */
  methods: {
    startDateChange(e) {
      this.setData({
        startDate: e.detail.value
      })
    },

    endDateChange(e) {
      this.setData({
        endDate: e.detail.value
      })
    },

    startTimeChange(e) {
      this.setData({
        startTime: e.detail.value
      })
    },

    endTimeChange(e) {
      this.setData({
        endTime: e.detail.value
      })
    },

    //modal显示
    showModal: function () {
      if (!this.data.isShow) {
        this._toggleModal();
        this.setData({
          startDate: util.getDefaultStartDate(),
          endDate: util.formatDate(new Date()),
          startTime: util.getDefaultStartTime(),
          endTime: util.formatTime(new Date())
        })
      }
    },

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

    //切换modal的显示还是隐藏
    _toggleModal: function () {
      this.setData({
        isShow: !this.data.isShow
      })
    },

    //取消事件 向外部page 发送事件通知
    _cancelModal: function () {
      this.hideModal();
      this.triggerEvent("cancelEvent");
    },

    //确认事件
    _confirmModal: function () {
      const start = new Date(this.data.startDate + " " + this.data.startTime).getTime();
      const end = new Date(this.data.endDate + " " + this.data.endTime).getTime();
      if(start >= end) {
        wx.showToast({
          title: '结束时间不得早于或者等于开始时间',
          icon: 'none'
        })
        return
      }
      var detail = {
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        startTime: this.data.startTime,
        endTime: this.data.endTime
      }
      this.triggerEvent("confirmEvent", detail);
    }
  }
})