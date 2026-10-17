package com.axle.utils;

public class SystemConstants {
    /**
     * 图片上传落盘目录。原版硬编码的是作者 Windows 上的工程路径，本机不存在。
     *
     * ⚠️ 不能放在 `src/main/resources/static/` 下：运行时 Spring 读的是
     * `target/classes/static`（构建期拷贝），启动后写进 src 的文件不会被任何
     * classpath 处理器看到 —— 上传接口返回 200，图片 URL 却是 404。
     * 所以落到工程目录之外，再由 `MvcConfig#addResourceHandlers` 把
     * `/imgs/**` 映射到这个真实目录。可用 -Daxle.upload.dir=... 覆盖。
     */
    public static final String IMAGE_UPLOAD_DIR = System.getProperty("axle.upload.dir",
            "uploads/imgs");
    public static final String USER_NICK_NAME_PREFIX = "user_";
    public static final int DEFAULT_PAGE_SIZE = 5;
    public static final int MAX_PAGE_SIZE = 10;
}
