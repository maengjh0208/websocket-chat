# 비동기 버전으로 alembic 초기화 파일 생성
backend-alembic-init:
	docker compose run --rm backend alembic init --template async alembic

backend-alembic-makemigrations:
	docker compose run --rm backend alembic revision --autogenerate -m "inital"

backend-alembic-migrate:
	docker compose run --rm backend alembic upgrade head