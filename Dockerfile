FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制源码
COPY . .

# 构建项目
RUN npm run build

# 安装 serve 用于静态服务
RUN npm install -g serve

# 暴露端口
EXPOSE 38888

# 启动服务
CMD ["serve", "dist", "-l", "38888"]
