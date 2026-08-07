from locust import LoadTestShape


class StepLoadShape(LoadTestShape):
    # duration은 테스트시작(0초)부터 이 단계가 끝나는 시점까지 누적 시간(초)
    # 10명 단계는 0~120초, 50명 단계는 120~240초, ... 200명 단계는 360~480초
    stages = [
        {"users": 10, "duration": 120, "spawn_rate": 5},
        {"users": 50, "duration": 240, "spawn_rate": 5},
        {"users": 100, "duration": 360, "spawn_rate": 5},
        {"users": 200, "duration": 480, "spawn_rate": 5},
    ]

    def tick(self) -> tuple[int, int] | None:
        run_time = self.get_run_time()

        for stage in StepLoadShape.stages:
            if run_time < stage["duration"]:
                return stage["users"], stage["spawn_rate"]

        return None  # 모든 단계 종료 -> 테스트 자동 종료
