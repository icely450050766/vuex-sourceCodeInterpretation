### 前言

+ 推荐使用 examples/shopping-cart 做效果测试，因为有划分Module。
+ 将会以增加注释的方式，实现对源码的解读
+ 部分源码在笔者的编辑器格式化了，并调整了.eslintrc的配置。如有格式警告，参考[eslint配置](https://eslint.org/docs/rules/)
   
---

### 源码结构

*源码存放于src文件夹内*
+ module文件夹：定义模块类和模块集合类，是生成状态树的基础
+ plugins文件夹：工具类，和主逻辑没关系，这部分笔者没研究
+ helpers.js：定义mapState/mapGetters/mapMutations/mapActions方法，为使用状态树提供快捷写法
+ index.js：开放给外部使用的接口函数
+ mixin.js：为Vue注入mixin，主要是为了注册store全局可用，包括子组件内
+ store.js：构件状态树的主逻辑部分
+ util.js：辅助的工具类

---

### 阅读顺序
store.js 的 export:

+ function install () {} 
   + mixin.js

+ class Store {} 
   + this._modules = new ModuleCollection(options) => module.js + module-collection.js
   + installModule(this, state, [], this._modules.root)
   + resetStoreVM(this, state)