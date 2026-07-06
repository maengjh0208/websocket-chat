####################################################
# 테스트 관련
####################################################

TEST_DATABASE_URL=$(shell grep -m1 TEST_DATABASE_URL backend/.env | cut -d= -f2-)
DB_USER=maengjh
DB_NAME=chat

# test_chat DB 생성 (최초 1회)
backend-test-init-db:
	docker compose exec db psql -U $(DB_USER) -d $(DB_NAME) -c "CREATE DATABASE test_chat;"

# 전체 통합 테스트 실행 (로컬에서 직접)
backend-test:
	cd backend && pytest . -v

####################################################
# DB 마이그레이션 관련
####################################################

# 비동기 버전으로 alembic 초기화 파일 생성
backend-alembic-init:
	docker compose run --rm backend alembic init --template async alembic

backend-alembic-makemigrations:
	docker compose run --rm backend alembic revision --autogenerate -m "inital"

backend-alembic-migrate:
	docker compose run --rm backend alembic upgrade head