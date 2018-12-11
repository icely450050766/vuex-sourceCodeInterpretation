/**
 * Reduce the code which written in Vue.js for getting the state.
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} states # Object's item can be a function which accept state and getters for param, you can do something for state and getters in it.
 * @param {Object}
 */
// 减少在Vue.js编写的获取状态的代码
export const mapState = normalizeNamespace((namespace, states) => {
    const res = {}
    // normalizeMap(states) 得到 [{ key: value }]
    normalizeMap(states).forEach(({key, val}) => {
        // 返回一个对象，所以要用...解构
        // 对象的每个属性的值是一个函数，符合computed的使用
        // computed(){ ...mapState({}) }
        res[key] = function mappedState() {
            let state = this.$store.state
            let getters = this.$store.getters
            // 有命名空间，传入对应子模块的state和getters
            if (namespace) {
                const module = getModuleByNamespace(this.$store, 'mapState', namespace)
                if (!module) {
                    return
                }
                state = module.context.state
                getters = module.context.getters
            }
            return typeof val === 'function'
                ? val.call(this, state, getters)
                : state[val]
        }
        // mark vuex getter for devtools
        res[key].vuex = true
    })
    return res
})

/**
 * Reduce the code which written in Vue.js for committing the mutation
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} mutations # Object's item can be a function which accept `commit` function as the first param, it can accept anthor params. You can commit mutation and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 */
// 使用：
// methods: {
//     ...mapMutations([
//         'increment', // 将 `this.increment()` 映射为 `this.$store.commit('increment')`
//         'incrementBy' // 支持载荷，将 `this.incrementBy(amount)` 映射为 `this.$store.commit('incrementBy', amount)`
//     ]),
//     ...mapMutations({
//         add: 'increment' // 将 `this.add()` 映射为 `this.$store.commit('increment')`
//     }),
//     ...mapActions([
//         'some/nested/module/foo', // -> this['some/nested/module/foo']()
//         'some/nested/module/bar' // -> this['some/nested/module/bar']()
//     ]),
//     ...mapActions('some/nested/module', [
//         'foo', // -> this.foo()
//         'bar' // -> this.bar()
//     ])
// }
export const mapMutations = normalizeNamespace((namespace, mutations) => {
    const res = {}
    normalizeMap(mutations).forEach(({key, val}) => {
        // 返回一个对象，所以要用...解构
        // 对象的每个属性的值是一个函数，符合methods的使用
        res[key] = function mappedMutation(...args) {
            // Get the commit method from store
            let commit = this.$store.commit
            if (namespace) {
                const module = getModuleByNamespace(this.$store, 'mapMutations', namespace)
                if (!module) {
                    return
                }
                commit = module.context.commit
            }
            return typeof val === 'function'
                ? val.apply(this, [commit].concat(args)) // val允许是 自定义函数
                : commit.apply(this.$store, [val].concat(args)) // 提交一个commit
        }
    })
    return res
})

/**
 * Reduce the code which written in Vue.js for getting the getters
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} getters
 * @return {Object}
 */
export const mapGetters = normalizeNamespace((namespace, getters) => {
    const res = {}
    normalizeMap(getters).forEach(({key, val}) => {
        // The namespace has been mutated by normalizeNamespace
        val = namespace + val
        res[key] = function mappedGetter() {
            if (namespace && !getModuleByNamespace(this.$store, 'mapGetters', namespace)) {
                return
            }
            if (process.env.NODE_ENV !== 'production' && !(val in this.$store.getters)) {
                console.error(`[vuex] unknown getter: ${val}`)
                return
            }
            // 直接返回 store.getters，在 ./store.js的 resetStoreVM() 里面定义
            // 利用计算属性，负责取得实时数据
            return this.$store.getters[val]
        }
        // mark vuex getter for devtools
        res[key].vuex = true
    })
    return res
})

/**
 * Reduce the code which written in Vue.js for dispatch the action
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} actions # Object's item can be a function which accept `dispatch` function as the first param, it can accept anthor params. You can dispatch action and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 */
export const mapActions = normalizeNamespace((namespace, actions) => {
    const res = {}
    normalizeMap(actions).forEach(({key, val}) => {
        res[key] = function mappedAction(...args) {
            // get dispatch function from store
            let dispatch = this.$store.dispatch
            if (namespace) {
                const module = getModuleByNamespace(this.$store, 'mapActions', namespace)
                if (!module) {
                    return
                }
                dispatch = module.context.dispatch
            }
            return typeof val === 'function'
                ? val.apply(this, [dispatch].concat(args)) // val允许是 自定义函数
                : dispatch.apply(this.$store, [val].concat(args)) // 提交一个dispatch
        }
    })
    return res
})

/**
 * Rebinding namespace param for mapXXX function in special scoped, and return them by simple object
 * @param {String} namespace
 * @return {Object}
 */
export const createNamespacedHelpers = (namespace) => ({
    mapState: mapState.bind(null, namespace),
    mapGetters: mapGetters.bind(null, namespace),
    mapMutations: mapMutations.bind(null, namespace),
    mapActions: mapActions.bind(null, namespace)
})

/**
 * Normalize the map
 * normalizeMap([1, 2, 3]) => [ { key: 1, val: 1 }, { key: 2, val: 2 }, { key: 3, val: 3 } ]
 * normalizeMap({a: 1, b: 2, c: 3}) => [ { key: 'a', val: 1 }, { key: 'b', val: 2 }, { key: 'c', val: 3 } ]
 * @param {Array|Object} map
 * @return {Object}
 */
// 兼容两种写法：都转为：[{ key: value },{ key: value }]
// ...mapActions([
//     'increment',
//     'incrementBy'
// ]),
// ...mapActions({
//     add: 'increment'
// })
// p.s. Object.keys()得到 一个数组
function normalizeMap(map) {
    return Array.isArray(map)
        ? map.map(key => ({key, val: key}))
        : Object.keys(map).map(key => ({key, val: map[key]}))
}

// 兼容两种写法：
// ...mapState({
//     a: state => state.some.nested.module.a,
//     b: state => state.some.nested.module.b
// })
// ...mapState('some/nested/module', {
//     a: state => state.a,
//     b: state => state.b
// })
// 返回一个 包含两个参数 的函数：命名空间，映射
function normalizeNamespace(fn) {
    return (namespace, map) => {
        if (typeof namespace !== 'string') {
            map = namespace
            namespace = ''
        } else if (namespace.charAt(namespace.length - 1) !== '/') {
            namespace += '/'
        }
        return fn(namespace, map)
    }
}

/**
 * Search a special module from store by namespace. if module not exist, print error message.
 * @param {Object} store
 * @param {String} helper
 * @param {String} namespace
 * @return {Object}
 */
// 通过 store._modulesNamespaceMap，取得命名空间 对应的模块对象
function getModuleByNamespace(store, helper, namespace) {
    const module = store._modulesNamespaceMap[namespace]
    if (process.env.NODE_ENV !== 'production' && !module) {
        console.error(`[vuex] module namespace not found in ${helper}(): ${namespace}`)
    }
    return module
}
