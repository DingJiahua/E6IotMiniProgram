// index.js
// 获取应用实例
const app = getApp()

const ANXIN_SERVICE_UUID = "0000FFA0-0000-1000-8000-00805F9B34FB";
const LORA_SERVICE_UUID = "6C228FCE-4F7F-7528-6613-6D4175359501";
const PORTABLE_TH_UUID = "00003000-0000-1000-8000-00805F9B34FB"

// ArrayBuffer转16进度字符串示例
function ab2hex(buffer) {
  const hexArr = Array.prototype.map.call(
    new Uint8Array(buffer),
    function (bit) {
      return ('00' + bit.toString(16)).slice(-2)
    }
  )
  return hexArr.join('')
}

// ArrayBuffer转16进度字符串示例
function ab2hexWithSpace(buffer) {
  const hexArr = Array.prototype.map.call(
    new Uint8Array(buffer),
    function (bit) {
      return ('00' + bit.toString(16)).slice(-2)
    }
  )
  return hexArr.join(' ')
}

var hex2ab = function (hex) {
  var typedArray = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function (h) {
    return parseInt(h, 16)
  }))

  var buffer = typedArray.buffer
  return buffer
}

/**
 * 字符串转为ArrayBuffer对象
 */
function str2ab(str) {
  var buf = new ArrayBuffer(str.length)
  var bufView = new Uint8Array(buf)
  for (var i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i)
  }
  return buf
}

function versionCompare(ver1, ver2) { //版本比较
  var version1pre = parseFloat(ver1)
  var version2pre = parseFloat(ver2)
  var version1next = parseInt(ver1.replace(version1pre + ".", ""))
  var version2next = parseInt(ver2.replace(version2pre + ".", ""))
  if (version1pre > version2pre)
    return true
  else if (version1pre < version2pre)
    return false
  else {
    if (version1next > version2next)
      return true
    else
      return false
  }
}

function inArray(arr, key, val) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i][key] === val) {
      return i
    }
  }
  return -1
}

//延时
function sleep(numberMillis) {
  var now = new Date();
  var exitTime = now.getTime() + numberMillis;
  while (true) {
    now = new Date();
    if (now.getTime() > exitTime)
      return;
  }
}

Page({
  data: {
    motto: '正在扫描设备',
    userInfo: {},
    hasUserInfo: false,
    devices: []
  },

  onReady: function () {
  },

  onShow: function () {

  },

  // 事件处理函数
  bindViewTap() {
    wx.navigateTo({
      url: '../logs/logs'
    })
  },
  onLoad() {
    if (app.getPlatform() == 'android' && versionCompare('6.5.7', app.getVersion())) {
      wx.showModal({
        title: '提示',
        content: '当前微信版本过低，请更新至最新版本',
        showCancel: false
      })
    } else if (app.getPlatform() == 'ios' && versionCompare('6.5.6', app.getVersion())) {
      wx.showModal({
        title: '提示',
        content: '当前微信版本过低，请更新至最新版本',
        showCancel: false
      })
    } else {
      var that = this
      wx.getSetting({
        success(res) {
          if (res.authSetting['scope.bluetooth']) {
            that.openBluetoothAdapter()
          } else {
            wx.authorize({
              scope: 'scope.bluetooth',
              success() {
                that.openBluetoothAdapter()
              },
              fail() {
                that.showBtPermissionModal()
              }
            })
          }
        }
      })
    }
  },

  showBtPermissionModal() {
    var that = this
    wx.showModal({
      title: '权限申请',
      content: '小程序申请使用蓝牙',
      showCancel: true,
      success: res => {
        if (res.confirm) {
          wx.openSetting({
            success(res) {
              that.openBluetoothAdapter()
            },
            fail(res) {
              console.log(res)
            }
          })
        }
      }
    })
  },

  onUnload() {
    this.closeBluetoothAdapter()
    this.closeTcp()
  },
  openBluetoothAdapter() {
    var that = this
    wx.openBluetoothAdapter({
      success: (res) => {
        // wx.showLoading({
        //   title: '正在扫描设备',
        // })
        this.startBluetoothDevicesDiscovery()
      },
      fail: (res) => {
        if (res.errno == 103) {
          this.showBtPermissionModal()
        } else if (res.errCode == 10001) {
          wx.showModal({
            content: '未找到蓝牙设备, 请打开蓝牙后重试。',
            showCancel: false,
            title: '错误'
          })
          wx.onBluetoothAdapterStateChange((result) => {
            if (result && result.available && !result.discovering) {
              // wx.showLoading({
              //   title: '正在扫描设备',
              // })
              this.startBluetoothDevicesDiscovery()
            }
          })
        }
      },
      complete() {
        wx.onBLEConnectionStateChange(function (res) {
          // 该方法回调中可以用于处理连接意外断开等异常情况
          if (!res.connected) {
            that.setData({
              motto: '正在扫描设备',
              devices: []
            })
            that.closeBluetoothAdapter()
            sleep(500)
            that.openBluetoothAdapter()
          }
        })
      }
    })
  },

  startBluetoothDevicesDiscovery() {
    if (this._discoveryStarted) {
      return
    }
    console.log('startBluetoothDevicesDiscovery')
    this._discoveryStarted = true
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      interval: 0,
      services: [ANXIN_SERVICE_UUID, LORA_SERVICE_UUID, PORTABLE_TH_UUID],
      success: (res) => {
        console.log(res)
        this.onBluetoothDeviceFound()
      },
      fail: (res) => {
        wx.hideLoading()
        wx.showToast({
          title: '扫描失败',
        })
      }
    })
  },
  onBluetoothDeviceFound() {
    wx.onBluetoothDeviceFound((result) => {
      // this.stopBluetoothDevicesDiscovery()
      result.devices.forEach(device => {
        if (!device.name && !device.localName) {
          return
        }
        const foundDevices = this.data.devices
        const idx = inArray(foundDevices, 'deviceId', device.deviceId)
        const data = {}
        if (idx === -1) {
          data[`devices[${foundDevices.length}]`] = device
        } else {
          data[`devices[${idx}]`] = device
        }
        this.setData(data)
      })
    })
  },

  goToDeviceDetailPage(e) {
    this.stopBluetoothDevicesDiscovery()
    const ds = e.currentTarget.dataset
    const deviceId = ds.deviceId
    const name = ds.name
    const uuid = ds.uuid
    if (uuid.some(item => item === ANXIN_SERVICE_UUID)) {
      wx.navigateTo({
        url: '/pages/anxin/anxin?deviceId=' + deviceId,
      })
    } else if (uuid.some(item => item === LORA_SERVICE_UUID)) {
      wx.navigateTo({
        url: '/pages/lora-probe/lora-probe?deviceId=' + deviceId,
      })
    } else if (uuid.some(item => item === PORTABLE_TH_UUID)) {
      wx.navigateTo({
        url: '/pages/portable_th/portable_th?deviceId=' + deviceId,
      })
    }
  },


  stopBluetoothDevicesDiscovery() {
    wx.stopBluetoothDevicesDiscovery({
      complete: () => {
        this._discoveryStarted = false
      }
    })
  },

  closeBluetoothAdapter() {
    wx.closeBluetoothAdapter()
    this._discoveryStarted = false
  },

  onShareAppMessage() {
    return {
      title: '蓝帮帮',
      path: 'pages/index/index'
    }
  }

  // getUserProfile(e) {
  //   // 推荐使用wx.getUserProfile获取用户信息，开发者每次通过该接口获取用户个人信息均需用户确认，开发者妥善保管用户快速填写的头像昵称，避免重复弹窗
  //   wx.getUserProfile({
  //     desc: '展示用户信息', // 声明获取用户个人信息后的用途，后续会展示在弹窗中，请谨慎填写
  //     success: (res) => {
  //       console.log(res)
  //       this.setData({
  //         userInfo: res.userInfo,
  //         hasUserInfo: true
  //       })
  //     }
  //   })
  // },
  // getUserInfo(e) {
  //   // 不推荐使用getUserInfo获取用户信息，预计自2021年4月13日起，getUserInfo将不再弹出弹窗，并直接返回匿名的用户个人信息
  //   console.log(e)
  //   this.setData({
  //     userInfo: e.detail.userInfo,
  //     hasUserInfo: true
  //   })
  // }
})