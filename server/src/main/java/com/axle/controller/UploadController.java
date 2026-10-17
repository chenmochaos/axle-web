package com.axle.controller;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import com.axle.dto.Result;
import com.axle.utils.SystemConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("upload")
public class UploadController {

    @PostMapping("review")
    public Result uploadImage(@RequestParam("file") MultipartFile image) {
        try {
            // 获取原始文件名称
            String originalFilename = image.getOriginalFilename();
            // 生成新文件名
            String fileName = createNewFileName(originalFilename);
            // 保存文件。
            // ⚠️ 必须用绝对路径：`MultipartFile.transferTo(File)` 对相对路径的解析
            // 基准是 Servlet 容器的临时目录（/tmp/tomcat.*/work/...），不是 JVM 的
            // 工作目录 —— 传相对路径会得到 FileNotFoundException，接口 500。
            File dest = new File(SystemConstants.IMAGE_UPLOAD_DIR, fileName).getAbsoluteFile();
            image.transferTo(dest);
            // 返回结果。必须带 `/imgs` 前缀：文件落盘在
            // `src/main/resources/static/imgs` 下，Spring 静态资源对外暴露的就是 `/imgs/**`。
            // 只回 `/reviews/xx` 的话前端拿到的 URL 是 404，而且上传接口本身还是 200。
            String url = "/imgs" + fileName;
            log.debug("文件上传成功，{}", url);
            return Result.ok(url);
        } catch (IOException e) {
            throw new RuntimeException("文件上传失败", e);
        }
    }

    @GetMapping("/review/delete")
    public Result deleteReviewImg(@RequestParam("name") String filename) {
        try {
            File base = new File(SystemConstants.IMAGE_UPLOAD_DIR).getCanonicalFile();
            // `name` 来自 query，`../..` 能逃出上传目录删掉任意文件 ——
            // 必须是「规范化之后仍在上传目录之内」才放行
            File file = new File(base, filename).getCanonicalFile();
            if (!file.toPath().startsWith(base.toPath()) || !file.isFile()) {
                return Result.fail("错误的文件名称");
            }
            FileUtil.del(file);
            return Result.ok();
        } catch (IOException e) {
            return Result.fail("删除失败");
        }
    }

    private String createNewFileName(String originalFilename) {
        // 获取后缀
        String suffix = StrUtil.subAfter(originalFilename, ".", true);
        // 生成目录
        String name = UUID.randomUUID().toString();
        int hash = name.hashCode();
        int d1 = hash & 0xF;
        int d2 = (hash >> 4) & 0xF;
        // 判断目录是否存在
        File dir = new File(SystemConstants.IMAGE_UPLOAD_DIR, StrUtil.format("/reviews/{}/{}", d1, d2));
        if (!dir.exists()) {
            dir.mkdirs();
        }
        // 生成文件名
        return StrUtil.format("/reviews/{}/{}/{}.{}", d1, d2, name, suffix);
    }
}
