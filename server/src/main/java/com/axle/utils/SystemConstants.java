package com.axle.utils;

public class SystemConstants {
    /**
     * 图片上传落盘目录。原版硬编码的是作者 Windows 上的工程路径，本机不存在；
     * 现指向后端静态资源目录（与 `pnpm build:embed` 的产物同目录），可用
     * -Daxle.upload.dir=... 覆盖。
     */
    public static final String IMAGE_UPLOAD_DIR = System.getProperty("axle.upload.dir",
            "src/main/resources/static/imgs");
    public static final String USER_NICK_NAME_PREFIX = "user_";
    public static final int DEFAULT_PAGE_SIZE = 5;
    public static final int MAX_PAGE_SIZE = 10;
}
