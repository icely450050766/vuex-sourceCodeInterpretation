export default function (Vue) {
    // 判断 vue版本
    const version = Number(Vue.version.split('.')[0])

    if (version >= 2) {
        // https://cn.vuejs.org/v2/api/#Vue-mixin
        // 全局注册一个混入，影响注册之后所有创建的每个 Vue实例（vue组件也是一个vue实例）
        Vue.mixin({beforeCreate: vuexInit})

    } else { // 1.x版本，重写_init，注入vuex的初始化
        const _init = Vue.prototype._init
        Vue.prototype._init = function (options = {}) {
            options.init = options.init
                ? [vuexInit].concat(options.init)
                : vuexInit
            // 调用原本 vue的_init方法
            _init.call(this, options)
        }
    }

    // vuex init钩子，注入每个实例
    function vuexInit() {
        // Vue 实例的初始化的自定义属性，new Vue(options)
        const options = this.$options

        // main.js的 new Vue() 会生成一个实例
        // app.vue 及其他.vue，都属于上面的实例的子组件 VueComponent
        // console.log(this)

        // $store全局注入，子组件使用父组件的$store
        if (options.store) {
            this.$store = typeof options.store === 'function'
                ? options.store() // 类似vue组件的 data(){reuturn{…}}，每次子组件生成新的data数据，避免子组件多次使用，数据被污染
                : options.store
        } else if (options.parent && options.parent.$store) {
            this.$store = options.parent.$store
        }
    }
}
