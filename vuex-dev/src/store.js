import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import {forEachValue, isObject, isPromise, assert} from './util'

// 1、记录vuex 是否已被install
// 2、内部为了实现读数据的实时性，有生成vue实例
let Vue

export class Store {
    constructor(options = {}) {
        // 再次校验是否已注册vuex
        if (!Vue && typeof window !== 'undefined' && window.Vue) {
            install(window.Vue)
        }

        // 对vuex要使用的技术 断言（如Promise，并非所有浏览器都支持，针对没使用babel的情况）
        if (process.env.NODE_ENV !== 'production') {
            assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
            assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
            assert(this instanceof Store, `store must be called with the new operator.`)
        }

        const {
            plugins = [],
            strict = false
        } = options

        // 存储内部状态
        this._committing = false
        this._actions = Object.create(null) // 存放 所有actions处理函数
        this._actionSubscribers = []
        this._mutations = Object.create(null) // 存放 所有mutations处理函数
        this._wrappedGetters = Object.create(null) // 存放 所有getters处理函数
        this._modules = new ModuleCollection(options) // 状态树
        this._modulesNamespaceMap = Object.create(null) // 模块命名映射，即{模块名: 模块对象}
        this._subscribers = []
        this._watcherVM = new Vue()

        // 重写commit、dispatch，绑定this防止外部修改
        const store = this
        const {dispatch, commit} = this
        this.dispatch = function boundDispatch(type, payload) {
            return dispatch.call(store, type, payload)
        }
        this.commit = function boundCommit(type, payload, options) {
            return commit.call(store, type, payload, options)
        }

        // 严格模式
        this.strict = strict

        // 模块树的根 state
        const state = this._modules.root.state

        // 初始化 模块树。递归注册所有子模块，收集所有模块的getters 存放到 this._wrappedGetters
        installModule(this, state, [], this._modules.root)

        // 初始化存储VM，利用计算属性，负责取得实时数据
        resetStoreVM(this, state)

        // 应用插件
        plugins.forEach(plugin => plugin(this))

        const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools
        if (useDevtools) {
            devtoolPlugin(this)
        }

        // 查看 传入的option 和 最终生成的store
        console.log(options)
        console.log(this)
    }

    get state() {
        return this._vm._data.$$state
    }

    set state(v) {
        if (process.env.NODE_ENV !== 'production') {
            assert(false, `use store.replaceState() to explicit replace store state.`)
        }
    }

    commit(_type, _payload, _options) {
        // check object-style commit
        const {
            type,
            payload,
            options
        } = unifyObjectStyle(_type, _payload, _options)

        const mutation = {type, payload}
        const entry = this._mutations[type]
        if (!entry) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[vuex] unknown mutation type: ${type}`)
            }
            return
        }
        this._withCommit(() => {
            entry.forEach(function commitIterator(handler) {
                handler(payload)
            })
        })
        this._subscribers.forEach(sub => sub(mutation, this.state))

        if (
            process.env.NODE_ENV !== 'production' &&
            options && options.silent
        ) {
            console.warn(
                `[vuex] mutation type: ${type}. Silent option has been removed. ` +
                'Use the filter functionality in the vue-devtools'
            )
        }
    }

    dispatch(_type, _payload) {
        // check object-style dispatch
        const {
            type,
            payload
        } = unifyObjectStyle(_type, _payload)

        const action = {type, payload}
        const entry = this._actions[type]
        if (!entry) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[vuex] unknown action type: ${type}`)
            }
            return
        }

        this._actionSubscribers.forEach(sub => sub(action, this.state))

        return entry.length > 1
            ? Promise.all(entry.map(handler => handler(payload)))
            : entry[0](payload)
    }

    subscribe(fn) {
        return genericSubscribe(fn, this._subscribers)
    }

    subscribeAction(fn) {
        return genericSubscribe(fn, this._actionSubscribers)
    }

    watch(getter, cb, options) {
        if (process.env.NODE_ENV !== 'production') {
            assert(typeof getter === 'function', `store.watch only accepts a function.`)
        }
        return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
    }

    replaceState(state) {
        this._withCommit(() => {
            this._vm._data.$$state = state
        })
    }

    registerModule(path, rawModule, options = {}) {
        if (typeof path === 'string') path = [path]

        if (process.env.NODE_ENV !== 'production') {
            assert(Array.isArray(path), `module path must be a string or an Array.`)
            assert(path.length > 0, 'cannot register the root module by using registerModule.')
        }

        this._modules.register(path, rawModule)
        installModule(this, this.state, path, this._modules.get(path), options.preserveState)
        // reset store to update getters...
        resetStoreVM(this, this.state)
    }

    unregisterModule(path) {
        if (typeof path === 'string') path = [path]

        if (process.env.NODE_ENV !== 'production') {
            assert(Array.isArray(path), `module path must be a string or an Array.`)
        }

        this._modules.unregister(path)
        this._withCommit(() => {
            const parentState = getNestedState(this.state, path.slice(0, -1))
            Vue.delete(parentState, path[path.length - 1])
        })
        resetStore(this)
    }

    hotUpdate(newOptions) {
        this._modules.update(newOptions)
        resetStore(this, true)
    }

    _withCommit(fn) {
        const committing = this._committing
        this._committing = true
        fn()
        this._committing = committing
    }
}

function genericSubscribe(fn, subs) {
    if (subs.indexOf(fn) < 0) {
        subs.push(fn)
    }
    return () => {
        const i = subs.indexOf(fn)
        if (i > -1) {
            subs.splice(i, 1)
        }
    }
}

function resetStore(store, hot) {
    store._actions = Object.create(null)
    store._mutations = Object.create(null)
    store._wrappedGetters = Object.create(null)
    store._modulesNamespaceMap = Object.create(null)
    const state = store.state
    // init all modules
    installModule(store, state, [], store._modules.root, true)
    // reset vm
    resetStoreVM(store, state, hot)
}

function resetStoreVM(store, state, hot) {
    const oldVm = store._vm

    // bind store public getters
    store.getters = {}
    const wrappedGetters = store._wrappedGetters
    const computed = {}
    forEachValue(wrappedGetters, (fn, key) => {
        // use computed to leverage its lazy-caching mechanism
        computed[key] = () => fn(store)
        Object.defineProperty(store.getters, key, {
            get: () => store._vm[key],
            enumerable: true // for local getters
        })
    })

    // use a Vue instance to store the state tree
    // suppress warnings just in case the user has added
    // some funky global mixins
    const silent = Vue.config.silent
    Vue.config.silent = true
    store._vm = new Vue({
        data: {
            $$state: state
        },
        computed
    })
    Vue.config.silent = silent

    // enable strict mode for new vm
    if (store.strict) {
        enableStrictMode(store)
    }

    if (oldVm) {
        if (hot) {
            // dispatch changes in all subscribed watchers
            // to force getter re-evaluation for hot reloading.
            store._withCommit(() => {
                oldVm._data.$$state = null
            })
        }
        Vue.nextTick(() => oldVm.$destroy())
    }
}

// 初始化 模块树。递归注册所有子模块
function installModule(store, rootState, path, module, hot) {
    const isRoot = !path.length // 是否是根
    const namespace = store._modules.getNamespace(path) // 本模块的命名

    // 模块命名映射。在helpers.js要用
    if (module.namespaced) {
        store._modulesNamespaceMap[namespace] = module
    }

    // 非根模块下，把本模块的state对象，以key-value形式 挂载到父模块的state属性
    // 挂载的是对象，属于引用，因此根state属性存放的就是子模块的state，永远是最新的状态数据
    if (!isRoot && !hot) {
        const parentState = getNestedState(rootState, path.slice(0, -1)) // 取得 父模块的 state
        const moduleName = path[path.length - 1] // 本模块名
        store._withCommit(() => {
            // 挂载到父模块的 state属性
            Vue.set(parentState, moduleName, module.state)
        })
    }

    // 设置本模块的context属性，包含dispatch、commit、getters、state属性
    const local = module.context = makeLocalContext(store, namespace, path)

    // 在this._mutations下，注册当前模块的mutation
    // 外部调用this.$store.commit(type, preload)时，就是调用this._mutations[type]的方法
    module.forEachMutation((mutation, key) => {
        const namespacedType = namespace + key
        registerMutation(store, namespacedType, mutation, local)
    })

    // 在this._actions下，注册当前模块的action
    module.forEachAction((action, key) => {
        const type = action.root ? key : namespace + key
        const handler = action.handler || action
        registerAction(store, type, handler, local)
    })

    // 在this._wrappedGetters下，注册当前模块的getters
    module.forEachGetter((getter, key) => {
        const namespacedType = namespace + key
        registerGetter(store, namespacedType, getter, local)
    })

    // 递归注册所有子模块
    module.forEachChild((child, key) => {
        installModule(store, rootState, path.concat(key), child, hot)
    })
}

// 设置本模块的context属性，包含dispatch、commit、getters、state属性
// 如果没有命名空间，就使用根路径，不处理 参数type
function makeLocalContext(store, namespace, path) {
    const noNamespace = namespace === ''

    const local = {
        // 有命名空间时，返回全新函数：主要是让 参数type加上 本模块的命名，最后再调用store.dispatch方法
        dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
            const args = unifyObjectStyle(_type, _payload, _options) // 对入参进行处理，兼容两种传参方式
            const {payload, options} = args
            let {type} = args

            // options可设置{root: true}，则在命名空间模块里分发根的 action。返回一个解析所有被触发的 action 处理器的 Promise
            if (!options || !options.root) {
                type = namespace + type // 加上本模块的命名
                if (process.env.NODE_ENV !== 'production' && !store._actions[type]) {
                    console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
                    return
                }
            }

            return store.dispatch(type, payload)
        },

        commit: noNamespace ? store.commit : (_type, _payload, _options) => {
            const args = unifyObjectStyle(_type, _payload, _options) // 对入参进行处理，兼容两种传参方式
            const {payload, options} = args
            let {type} = args

            if (!options || !options.root) {
                type = namespace + type // 加上本模块的命名
                if (process.env.NODE_ENV !== 'production' && !store._mutations[type]) {
                    console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
                    return
                }
            }

            store.commit(type, payload, options)
        }
    }

    // 为 getters、state属性，设置get方法，它们随 this._vm 更新而改变
    Object.defineProperties(local, {
        getters: {
            get: noNamespace
                ? () => store.getters
                : () => makeLocalGetters(store, namespace) // 设置 子模块的getters
        },
        state: {
            get: () => getNestedState(store.state, path) // 遍历模块树的根state，返回 当前模块的state对象
        }
    })

    return local
}

// 设置 子模块的getters
function makeLocalGetters(store, namespace) {
    const gettersProxy = {} // getters代理

    // 本模块的命名长度
    const splitPos = namespace.length

    // 遍历 store.getters，搜索出本模块的getters所有属性
    // store.getters 在resetStoreVM() 中定义
    Object.keys(store.getters).forEach(type => {
        if (type.slice(0, splitPos) !== namespace) return // 不匹配

        // 截取 splitPos-结束位置 的字符串
        const localType = type.slice(splitPos)

        // 向 getters代理 添加属性
        Object.defineProperty(gettersProxy, localType, {
            get: () => store.getters[type],
            enumerable: true
        })
    })

    return gettersProxy
}

function registerMutation(store, type, handler, local) {
    const entry = store._mutations[type] || (store._mutations[type] = [])
    entry.push(function wrappedMutationHandler(payload) {
        handler.call(store, local.state, payload)
    })
}

function registerAction(store, type, handler, local) {
    const entry = store._actions[type] || (store._actions[type] = [])
    entry.push(function wrappedActionHandler(payload, cb) {
        let res = handler.call(store, {
            dispatch: local.dispatch,
            commit: local.commit,
            getters: local.getters,
            state: local.state,
            rootGetters: store.getters,
            rootState: store.state
        }, payload, cb)
        if (!isPromise(res)) {
            res = Promise.resolve(res)
        }
        if (store._devtoolHook) {
            return res.catch(err => {
                store._devtoolHook.emit('vuex:error', err)
                throw err
            })
        } else {
            return res
        }
    })
}

function registerGetter(store, type, rawGetter, local) {
    if (store._wrappedGetters[type]) {
        if (process.env.NODE_ENV !== 'production') {
            console.error(`[vuex] duplicate getter key: ${type}`)
        }
        return
    }
    store._wrappedGetters[type] = function wrappedGetter(store) {
        return rawGetter(
            local.state, // local state
            local.getters, // local getters
            store.state, // root state
            store.getters // root getters
        )
    }
}

function enableStrictMode(store) {
    store._vm.$watch(function () {
        return this._data.$$state
    }, () => {
        if (process.env.NODE_ENV !== 'production') {
            assert(store._committing, `do not mutate vuex store state outside mutation handlers.`)
        }
    }, {deep: true, sync: true})
}

// 根据path数组，遍历模块树的 根state对象，返回 模块的state对象
function getNestedState(state, path) {
    return path.length
        ? path.reduce((state, key) => state[key], state)
        : state
}

// 对commit、dispatch的参数处理，兼容两种传参方式：
// 1.dispatch(type, payload, options)
// 2.dispatch({type: type, ...payload}, options)
function unifyObjectStyle(type, payload, options) {
    if (isObject(type) && type.type) {
        options = payload
        payload = type
        type = type.type
    }

    if (process.env.NODE_ENV !== 'production') {
        assert(typeof type === 'string', `expects string as the type, but found ${typeof type}.`)
    }

    return {type, payload, options}
}

// https://cn.vuejs.org/v2/api/#Vue-use
// 安装 Vue.js 插件。如果插件是一个对象，必须提供 install 方法。
// 如果插件是一个函数，它会被作为 install 方法。
// install 方法调用时，会将 Vue 作为参数传入
export function install(_Vue) {
    // 已被install，输出错误提示
    if (Vue && _Vue === Vue) {
        if (process.env.NODE_ENV !== 'production') {
            console.error(
                '[vuex] already installed. Vue.use(Vuex) should be called only once.'
            )
        }
        return
    }
    Vue = _Vue
    applyMixin(Vue)
}
