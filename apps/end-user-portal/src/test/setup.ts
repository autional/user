import '@testing-library/jest-dom/vitest';
// jsdom 的缺口（matchMedia / ResizeObserver）不再各站各抄一份 —— 由设计系统统一提供。
// 实测：三个控制台各抄了一份、user 漏了 ResizeObserver，于是 user 接入 antd 的当天，
// 8 个既有用例一起红在「ResizeObserver is not defined」上。
import '@autional/ui/test-setup';
