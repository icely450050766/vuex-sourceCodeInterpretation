import Module from './module'
import {assert, forEachValue} from '../util'

export default class ModuleCollection {
    constructor(rawRootModule) {
        // 递归注册 所有子模块
        this.register([], rawRootModule, false)
        // console.log(JSON.stringify(this))
    }

    // 通过 path数组，返回模块对象
    get(path) {
        return path.reduce((module, key) => {
            return module.getChild(key)
        }, this.root)
    }

    // 通过 path数组，返回模块的命名
    getNamespace(path) {
        let module = this.root
        return path.reduce((namespace, key) => {
            module = module.getChild(key)
            return namespace + (module.namespaced ? key + '/' : '')
        }, '')
    }

    update(rawRootModule) {
        update([], this.root, rawRootModule)
    }

    // 递归注册 所有子模块
    register(path, rawModule, runtime = true) {
        // 对 getters、mutations、actions属性 的类型断言
        if (process.env.NODE_ENV !== 'production') {
            assertRawModule(path, rawModule)
        }

        // 生成本模块，且挂到模块树上
        const newModule = new Module(rawModule, runtime)
        if (path.length === 0) {
            this.root = newModule // 根模块直接赋值
        } else {
            const parent = this.get(path.slice(0, -1)) // 取得父模块
            parent.addChild(path[path.length - 1], newModule) // 父模块 插入子模块
        }

        // 注册本模块 的所有子模块
        if (rawModule.modules) {
            forEachValue(rawModule.modules, (rawChildModule, key) => {
                this.register(path.concat(key), rawChildModule, runtime)
            })
        }
    }

    // 取消注册某路径 的模块
    unregister(path) {
        const parent = this.get(path.slice(0, -1)) // 取得父模块
        const key = path[path.length - 1] // 取得要删除的 模块名
        if (!parent.getChild(key).runtime) return

        parent.removeChild(key) // 父模块 移除子模块
    }
}

function update(path, targetModule, newModule) {
    if (process.env.NODE_ENV !== 'production') {
        assertRawModule(path, newModule)
    }

    // update target module
    targetModule.update(newModule)

    // update nested modules
    if (newModule.modules) {
        for (const key in newModule.modules) {
            if (!targetModule.getChild(key)) {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn(
                        `[vuex] trying to add a new module '${key}' on hot reloading, ` +
                        'manual reload is needed'
                    )
                }
                return
            }
            update(
                path.concat(key),
                targetModule.getChild(key),
                newModule.modules[key]
            )
        }
    }
}

// 函数断言
const functionAssert = {
    assert: value => typeof value === 'function', // 断言条件
    expected: 'function' // 错误提示
}

// 函数 / 包含 handler属性是函数 的对象断言
const objectAssert = {
    assert: value => typeof value === 'function' ||
        (typeof value === 'object' && typeof value.handler === 'function'),
    expected: 'function or object with "handler" function'
}

// 要断言的属性
const assertTypes = {
    getters: functionAssert,
    mutations: functionAssert,
    actions: objectAssert
}

// 对 getters、mutations、actions属性 的类型断言
function assertRawModule(path, rawModule) {
    Object.keys(assertTypes).forEach(key => {
        if (!rawModule[key]) return

        const assertOptions = assertTypes[key]

        // 对3种属性 包含的所有属性 断言
        forEachValue(rawModule[key], (value, type) => {
            assert(
                assertOptions.assert(value),
                makeAssertionMessage(path, key, type, value, assertOptions.expected)
            )
        })
    })
}

// 断言 抛出的错误信息
function makeAssertionMessage(path, key, type, value, expected) {
    let buf = `${key} should be ${expected} but "${key}.${type}"`
    if (path.length > 0) {
        buf += ` in module "${path.join('.')}"`
    }
    buf += ` is ${JSON.stringify(value)}.`
    return buf
}
