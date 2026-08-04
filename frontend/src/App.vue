<template>
  <router-view></router-view>
</template>

<style>
/* Base styles to match requirements */
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background-color: #F7F7F5; /* 浅米白底色 */
}

#app {
  height: 100%;
}

/* Global rounded corners for cards */
.el-card {
  border-radius: 12px !important;
}

/* Primary color override for Element Plus (if needed via CSS variables) */
:root {
  --el-color-primary: #409EFF; /* 浅蓝 */
  --el-color-warning: #FFB84D; /* 浅橙色 */
}
</style>
