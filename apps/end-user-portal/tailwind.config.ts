import type { Config } from 'tailwindcss';
import preset from '@autional/tailwind-preset';
// 公告页用了 prose prose-sm（announcements/page.tsx:108），但本站此前 plugins: []，
// 于是那三行 className 里没有一个类有对应规则——构建照常成功，页面却是没有排版的纯文本。
// 这正是执行日志 §U66 第①项警告的那一类失败：**构建不报错、值在能力没了**。
// 权威 preset 的 plugins 是空的（typography 属于「谁要用谁装」，不该由共享 preset 强加给
// 14 个站），所以这里像 web 一样自己装上。
import typography from '@tailwindcss/typography';

const config: Config = {
  darkMode: 'class',
  presets: [preset],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@autional/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [typography],
};

export default config;
