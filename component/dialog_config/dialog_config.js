// pages/dialogConfig/dialogConfig.js
const Util = require('../../utils/util.js')

Component({

  /**
   * 组件的属性列表
   */
  properties: {
    title: {
      type: String,
      value: '这里是默认标题'
    },

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

    animated: {
      type: Boolean,
      value: false
    },

    //模态框大小(sm md)
    modalSize: {
      type: String,
      value: "md"
    },

    //动画时间(默认300)
    animationOption: {
      type: Object,
      value: {
        duration: 300
      }
    },

    deviceId: {
      type: String,
      value: ""
    },
    returnInterval: {
      type: Number,
      value: 15
    },
    alarm: {
      type: Boolean,
      value: false
    },
    lowTemp: {
      type: Number,
      value: 0
    },
    highTemp: {
      type: Number,
      value: 0
    },
  },

  /**
   * 组件的初始数据
   */
  data: {
    isShow: false,
    animation: '',
    isDisabled: false
  },

  ready: function () {
    this.animation = wx.createAnimation({
      duration: this.data.animationOption.duration,
      timingFunction: "linear",
      delay: 0
    });
    this.modal = this.selectComponent("#pwd_modal")
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

    _confirmEvent: function (e) {
      console.log("点击确定了!" + e.detail.password);
      const pwd = Util.getRealTimePwd(new Date())
      if(pwd === e.detail.password) {
        this.setData({
          isDisabled: true
        })
        wx.showToast({
          title: '验证通过',
          icon: 'none'
        })
      } else {
        wx.showToast({
          title: '密码错误',
          icon: 'none'
        })
      }
    },
  
    _cancelEvent: function () {
      console.log("点击取消!");
    },

    bindModifyId(e) {
      if(!this.data.isDisabled) {
        this.modal.showModal()
      } else {
        wx.showToast({
          title: '已经获取修改权限',
          icon: 'none'
        })
      }
    },

    getDeviceId(e) {
      this.properties.deviceId = e.detail.value
    },

    getLowTemp(e) {
      // const regex=/^[-]?((([0-9]|[1-9][0-9])(.[0-9])?)|100(.0)?)$/
      // if(regex.test(e.detail.value)) {
      //   this.properties.lowTemp = e.detail.value
      // } else{
      //   return this.properties.lowTemp
      // } 
      this.properties.lowTemp = e.detail.value
    },

    getHighTemp(e) {
      this.properties.highTemp = e.detail.value
    },

    bindReturnIntervalChange(e) {
      if (e.detail.value == 1) {
        this.properties.returnInterval = 10
      } else {
        this.properties.returnInterval = 15
      }
    },

    bindAlarmChange(e) {
      this.properties.alarm = e.detail.value
    },

    //modal显示
    showModal: function () {
      if (!this.data.isShow) {
        this._toggleModal();
      }
    },

    //切换modal的显示还是隐藏
    _toggleModal: function () {
      if (!this.data.animated) {
        this.setData({
          isShow: !this.data.isShow,
          isDisabled: false
        })
      } else {
        let isShow = !this.data.isShow;
        this._executeAnimation(isShow);
      }


    },

    //根据需求执行动画
    _executeAnimation: function (isShow) {

      let animation = this.animation;
      if (isShow) {

        animation.opacity(0).step();

        this.setData({
          animationData: animation.export(),
          isShow: true
        })

        setTimeout(function () {
          animation.opacity(1).step()
          this.setData({
            animationData: animation.export()
          })
        }.bind(this), 50)
      } else {
        animation.opacity(0).step()
        this.setData({
          animationData: animation.export()
        })

        setTimeout(function () {
          this.setData({
            isShow: isShow
          })
        }.bind(this), this.data.animationOption.duration)

      }
    },
    //取消事件 向外部page 发送事件通知
    _cancelModal: function () {
      this.hideModal();
      this.triggerEvent("cancelEvent");
    },

    //确认事件
    _confirmModal: function () {
      var detail = {
        deviceId: this.properties.deviceId,
        returnInterval: this.properties.returnInterval,
        alarm: this.properties.alarm,
        lowTemp: this.properties.lowTemp,
        highTemp: this.properties.highTemp,
      }
      this.triggerEvent("confirmEvent", detail);
    }
  }
})