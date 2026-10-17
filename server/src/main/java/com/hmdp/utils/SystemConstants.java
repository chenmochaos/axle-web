package com.hmdp.utils;

public class SystemConstants {
    /**
     * 图片上传落盘目录。原版硬编码的是作者 Windows 上的 WebStorm 工程路径，本机不存在，
     * 改为主工作区 serve.js 托管的静态资源目录，可用 -Dhmdp.upload.dir=... 覆盖。
     */
    public static final String IMAGE_UPLOAD_DIR = System.getProperty("hmdp.upload.dir",
            "/home/minus/Code/Full-Stack/Back-End/hm-dianping/本地生活点评平台/src/main/resources/nginx-1.18.0/html/hmdp/imgs");
    public static final String USER_NICK_NAME_PREFIX = "user_";
    public static final int DEFAULT_PAGE_SIZE = 5;
    public static final int MAX_PAGE_SIZE = 10;
}
