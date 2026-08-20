package com.botnest.manager.controller;

import com.botnest.manager.dto.StartBotRequest;
import com.botnest.manager.model.BotInstance;
import com.botnest.manager.service.DockerBotService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/bots")
public class BotController {

    private final DockerBotService dockerBotService;

    @Value("${botnest.internal-api-key}")
    private String internalApiKey;

    public BotController(DockerBotService dockerBotService) {
        this.dockerBotService = dockerBotService;
    }

    private boolean unauthorized(String providedKey) {
        return internalApiKey == null || !internalApiKey.equals(providedKey);
    }

    @PostMapping("/start")
    public ResponseEntity<?> start(
            @RequestHeader("X-Internal-Api-Key") String apiKey,
            @Valid @RequestBody StartBotRequest req
    ) {
        if (unauthorized(apiKey)) {
            return ResponseEntity.status(401).body(Map.of("message", "Unauthorized"));
        }
        BotInstance instance = dockerBotService.start(req.getBotId(), req.getOwnerId(), req.getSessionId());
        return ResponseEntity.ok(instance);
    }

    @PostMapping("/{botId}/stop")
    public ResponseEntity<?> stop(
            @RequestHeader("X-Internal-Api-Key") String apiKey,
            @PathVariable String botId
    ) {
        if (unauthorized(apiKey)) {
            return ResponseEntity.status(401).body(Map.of("message", "Unauthorized"));
        }
        BotInstance instance = dockerBotService.stop(botId);
        if (instance == null) return ResponseEntity.status(404).body(Map.of("message", "Bot not found"));
        return ResponseEntity.ok(instance);
    }

    @GetMapping("/{botId}/status")
    public ResponseEntity<?> status(
            @RequestHeader("X-Internal-Api-Key") String apiKey,
            @PathVariable String botId
    ) {
        if (unauthorized(apiKey)) {
            return ResponseEntity.status(401).body(Map.of("message", "Unauthorized"));
        }
        BotInstance instance = dockerBotService.getStatus(botId);
        if (instance == null) return ResponseEntity.status(404).body(Map.of("message", "Bot not found"));
        return ResponseEntity.ok(instance);
    }

    @GetMapping
    public ResponseEntity<?> listAll(@RequestHeader("X-Internal-Api-Key") String apiKey) {
        if (unauthorized(apiKey)) {
            return ResponseEntity.status(401).body(Map.of("message", "Unauthorized"));
        }
        return ResponseEntity.ok(dockerBotService.listAll());
    }
}
