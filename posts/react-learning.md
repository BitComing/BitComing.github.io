# React学习笔记

React 是一个用于构建用户界面的 JavaScript 库。在学习 React 的过程中，我积累了一些经验和心得，希望与大家分享。

## 核心概念

### JSX

JSX 是 JavaScript 的语法扩展，允许我们在 JavaScript 中编写类似 HTML 的代码。

```jsx
const element = <h1>Hello, World!</h1>;
```

### 组件

React 应用由组件构成，每个组件都是独立的、可复用的代码块。

```jsx
function Welcome(props) {
  return <h1>Hello, {props.name}</h1>;
}
```

### 状态管理

使用 `useState` Hook 来管理组件的状态。

```jsx
const [count, setCount] = useState(0);
```

## 最佳实践

1. **组件拆分**：将复杂的组件拆分成小的、单一职责的组件
2. **状态提升**：将共享状态提升到最近的共同父组件
3. **避免不必要的渲染**：使用 memo、useMemo、useCallback 等优化性能

## 学习资源

- [React 官方文档](https://react.dev/)
- [React 教程](https://react.dev/learn)

希望这些笔记能对你有所帮助！