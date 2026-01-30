#!/bin/bash

# 脚本配置
IMAGE_NAME="customer-service-board"
IMAGE_TAG="latest"
PORT="38888"
OUTPUT_DIR="deploy_package"
TAR_NAME="image.tar"
PACKAGE_NAME="deploy_package.tar.gz"

echo "开始打包流程..."

# 1. 检查 Docker 环境
if ! command -v docker &> /dev/null; then
    echo "错误: 未检测到 Docker，请先安装 Docker Desktop。"
    exit 1
fi

# 2. 构建 Docker 镜像
echo "正在构建 Docker 镜像 ${IMAGE_NAME}:${IMAGE_TAG} (这可能需要几分钟)..."
# 使用 --platform linux/amd64 以确保在服务器（通常是 Linux）上兼容，特别是如果你在 M1/M2 Mac 上
docker build --platform linux/amd64 -t "${IMAGE_NAME}:${IMAGE_TAG}" .

if [ $? -ne 0 ]; then
    echo "错误: Docker 构建失败。"
    exit 1
fi
echo "Docker 镜像构建成功。"

# 3. 创建输出目录
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# 4. 导出镜像
echo "正在导出镜像为 ${TAR_NAME}..."
docker save -o "${OUTPUT_DIR}/${TAR_NAME}" "${IMAGE_NAME}:${IMAGE_TAG}"

if [ $? -ne 0 ]; then
    echo "错误: 镜像导出失败。"
    exit 1
fi
echo "镜像导出成功。"

# 5. 生成部署脚本 (run.sh)
echo "正在生成部署脚本 run.sh..."
cat > "${OUTPUT_DIR}/run.sh" <<EOF
#!/bin/bash

IMAGE_NAME="${IMAGE_NAME}"
TAG="${IMAGE_TAG}"
CONTAINER_NAME="${IMAGE_NAME}"
HOST_PORT="${PORT}"
INNER_PORT="${PORT}"

echo "开始部署服务..."

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "错误: 服务器未安装 Docker。"
    exit 1
fi

# 加载镜像
echo "正在加载镜像..."
docker load -i ${TAR_NAME}

# 停止并删除旧容器
if [ "\$(docker ps -aq -f name=\${CONTAINER_NAME})" ]; then
    echo "停止旧容器..."
    docker stop \${CONTAINER_NAME}
    docker rm \${CONTAINER_NAME}
fi

# 运行新容器
echo "启动新容器..."
docker run -d \\
  --restart always \\
  -p \${HOST_PORT}:\${INNER_PORT} \\
  --name \${CONTAINER_NAME} \\
  \${IMAGE_NAME}:\${TAG}

echo "部署完成！"
echo "服务已运行在端口: \${HOST_PORT}"
# 可选：如果有防火墙，提示用户开启端口
echo "请确保服务器防火墙已放行 \${HOST_PORT} 端口。"
EOF

chmod +x "${OUTPUT_DIR}/run.sh"

# 6. 压缩打包
echo "正在生成最终压缩包 ${PACKAGE_NAME}..."
tar -czf "$PACKAGE_NAME" -C "$OUTPUT_DIR" .
# 清理临时目录
rm -rf "$OUTPUT_DIR"

echo "========================================"
echo "打包完成！文件已生成: ${PACKAGE_NAME}"
echo "========================================"
echo "部署指南:"
echo "1. 将 ${PACKAGE_NAME} 上传到服务器。"
echo "2. 解压: tar -xzf ${PACKAGE_NAME}"
echo "3. 运行: ./run.sh"
echo "========================================"
