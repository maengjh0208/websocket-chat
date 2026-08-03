######################################## backend 테스트 (pytest) ########################################
DB_USER=$(shell grep -m1 '^DB_USER=' backend/.env.local | cut -d= -f2-)
DB_NAME=$(shell grep -m1 '^DB_NAME=' backend/.env.local | cut -d= -f2-)
TEST_DB_NAME=$(shell grep -m1 '^TEST_DB_NAME=' backend/.env.local | cut -d= -f2-)

# test_chat DB 생성 (최초 1회)
backend-test-init-db:
	docker compose exec db psql -U $(DB_USER) -d $(DB_NAME) -c "CREATE DATABASE $(TEST_DB_NAME);"

# 전체 통합 테스트 실행 (로컬에서 직접)
backend-test:
	docker compose exec -e ENV=test backend pytest . -v


######################################## backend DB 마이그레이션 ########################################
# 비동기 버전으로 alembic 초기화 파일 생성
backend-alembic-init:
	docker compose run --rm backend alembic init --template async alembic

# 마이그레이션 파일 생성
backend-alembic-makemigrations:
	docker compose run --rm backend alembic revision --autogenerate -m "inital"

# 마이그레이션 실행
backend-alembic-migrate:
	docker compose run --rm backend alembic upgrade head


######################################## docker compose 실행 ########################################
up:
	docker compose --env-file backend/.env.local up

up-scaleup:
	docker compose --env-file backend/.env.local up --scale backend=2

up-build:
	docker compose --env-file backend/.env.local up --build

down:
	docker compose down