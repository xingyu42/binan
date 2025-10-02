# syntax=docker/dockerfile:1.4

# 使用最新 LTS 版本的 Node.js 镜像作为基础镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制依赖声明文件
COPY package*.json ./

# 利用 BuildKit 缓存加速依赖安装
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# 复制应用代码（排除前端文件和敏感文件）
COPY . .

# 启动应用（以 root 身份运行以获得写权限）
CMD ["node", "app.js"]