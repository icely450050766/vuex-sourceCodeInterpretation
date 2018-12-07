import {forEachValue} from '../util'

// 存储模块的 数据结构
export default class Module {
    constructor(rawModule, runtime) {
        this.runtime = runtime
        this._children = Object.create(null) // 存放子模块
        this._rawModule = rawModule // 程序员传进来的 options对象
        // 状态
        const rawState = rawModule.state
        this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
    }

    // 本模块 是否 使用命名空间
    get namespaced() {
        return !!this._rawModule.namespaced
    }

    // 插入子模块
    addChild(key, module) {
        this._children[key] = module
    }

    // 移除子模块
    removeChild(key) {
        delete this._children[key]
    }

    // 获取子模块对象
    getChild(key) {
        return this._children[key]
    }

    update(rawModule) {
        this._rawModule.namespaced = rawModule.namespaced
        if (rawModule.actions) {
            this._rawModule.actions = rawModule.actions
        }
        if (rawModule.mutations) {
            this._rawModule.mutations = rawModule.mutations
        }
        if (rawModule.getters) {
            this._rawModule.getters = rawModule.getters
        }
    }

    // 遍历所有孩子，并执行fn方法
    forEachChild(fn) {
        forEachValue(this._children, fn)
    }

    // 遍历所有getters，并执行fn方法。fn参数：属性值、属性key
    forEachGetter(fn) {
        if (this._rawModule.getters) {
            forEachValue(this._rawModule.getters, fn)
        }
    }

    // 遍历所有actions，并执行fn方法
    forEachAction(fn) {
        if (this._rawModule.actions) {
            forEachValue(this._rawModule.actions, fn)
        }
    }

    // 遍历所有mutation，并执行fn方法
    forEachMutation(fn) {
        if (this._rawModule.mutations) {
            forEachValue(this._rawModule.mutations, fn)
        }
    }
}
