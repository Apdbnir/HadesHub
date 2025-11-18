#include <opencv2/opencv.hpp>
#include <iostream>
#include <string>
#include <sstream>
#include <vector>
#include <thread>
#include <atomic>
#include <mutex>
#include <ctime>
#include <iomanip>
#include <direct.h>
#include <windows.h>
#include <chrono>

static cv::VideoCapture* g_camera = nullptr;
static std::mutex g_camera_mutex;
static std::atomic<bool> g_app_running{ true };
static std::atomic<bool> g_camera_initialized{ false };
static std::vector<int> g_jpeg_params{ cv::IMWRITE_JPEG_QUALITY, 90 };

static std::atomic<bool> g_hidden_mode{ false };
static std::atomic<int> g_hidden_photos_count{ 0 };
static std::mutex g_hidden_mode_mutex;

// Функция для получения текущего времени в формате строки
static std::string now_timestamp()
{
    auto t = std::time(nullptr);
    std::tm tm{};
    localtime_s(&tm, &t);
    std::ostringstream os;
    os << std::put_time(&tm, "%Y%m%d_%H%M%S");
    return os.str();
}

// Функция для создания директории
static void ensure_dir(const std::string& dir)
{
    _mkdir(dir.c_str());
}

// Функция инициализации камеры
static bool init_camera()
{
    std::lock_guard<std::mutex> lock(g_camera_mutex);

    if (g_camera_initialized.load()) {
        return g_camera && g_camera->isOpened();
    }

    if (g_camera) {
        g_camera->release();
        delete g_camera;
        g_camera = nullptr;
    }

    std::cout << " Инициализация камеры..." << std::endl;

    // Try different backends in order of preference
    std::vector<std::pair<int, const char*>> backends;
    backends.push_back(std::make_pair(cv::CAP_MSMF, "MediaFoundation"));  // Try MF first as it's more robust
    backends.push_back(std::make_pair(cv::CAP_DSHOW, "DirectShow"));     // Fallback to DSHOW
    backends.push_back(std::make_pair(cv::CAP_V4L2, "V4L2"));            // For compatibility, though not used on Windows

    for (size_t i = 0; i < backends.size(); ++i) {
        int api = backends[i].first;
        const char* name = backends[i].second;
        g_camera = new cv::VideoCapture();

        // Try to open the camera with specific API
        if (g_camera->open(0, api)) {
            // Set camera properties with error checking
            bool propsSet = g_camera->set(cv::CAP_PROP_FRAME_WIDTH) &&
                           g_camera->set(cv::CAP_PROP_FRAME_HEIGHT) &&
                           g_camera->set(cv::CAP_PROP_FPS);

            // Wait a bit for camera to settle after setting properties
            std::this_thread::sleep_for(std::chrono::milliseconds(500));

            // Wait and try to get multiple valid frames to ensure camera is ready
            cv::Mat frame;
            bool gotValidFrame = false;
            for (int attempt = 0; attempt < 40; attempt++) {  // Try for up to 4 seconds (40 attempts * 100ms)
                if (g_camera->read(frame) && !frame.empty()) {
                    // Verify that the frame actually has proper pixel data (not all black)
                    cv::Scalar meanValue = cv::mean(frame);
                    if (meanValue[0] > 10.0 || meanValue[1] > 10.0 || meanValue[2] > 10.0) {
                        // At least one channel has meaningful brightness (increased threshold)
                        gotValidFrame = true;
                        break;
                    }
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
            }

            if (gotValidFrame) {
                g_camera_initialized = true;
                std::cout << "Камера инициализирована: " << name << std::endl;
                return true;
            }

            std::cout << " Камера открыта с " << name << ", но не удалось получить валидный фрейм" << std::endl;
            g_camera->release();
            delete g_camera;
            g_camera = nullptr;
        } else {
            std::cout << "Не удалось открыть камеру с " << name << std::endl;
        }
    }

    std::cerr << " Не удалось открыть камеру" << std::endl;
    g_camera_initialized = true;
    return false;
}

// Функция захвата кадра
static cv::Mat capture_frame()
{
    std::lock_guard<std::mutex> lock(g_camera_mutex);

    if (!g_camera || !g_camera->isOpened()) {
        return cv::Mat();
    }

    cv::Mat frame;
    g_camera->read(frame);

    return frame.empty() ? cv::Mat() : frame;
}

// Функция получения информации о камере
static void display_camera_info()
{
    std::lock_guard<std::mutex> lock(g_camera_mutex);
    
    if (!g_camera || !g_camera->isOpened()) {
        std::cout << "Камера недоступна!" << std::endl;
        return;
    }

    double w = g_camera->get(cv::CAP_PROP_FRAME_WIDTH);
    double h = g_camera->get(cv::CAP_PROP_FRAME_HEIGHT);
    double fps = g_camera->get(cv::CAP_PROP_FPS);
    double br = g_camera->get(cv::CAP_PROP_BRIGHTNESS);
    double co = g_camera->get(cv::CAP_PROP_CONTRAST);
    double sa = g_camera->get(cv::CAP_PROP_SATURATION);

    std::cout << "========================================" << std::endl;
    std::cout << "Информация о веб-камере:" << std::endl;
    std::cout << "  Ширина: " << (int)w << " пикселей" << std::endl;
    std::cout << "  Высота: " << (int)h << " пикселей" << std::endl;
    std::cout << "  FPS: " << (int)fps << std::endl;
    std::cout << "  Яркость: " << br << std::endl;
    std::cout << "  Контрастность: " << co << std::endl;
    std::cout << "  Насыщенность: " << sa << std::endl;
    std::cout << "========================================" << std::endl;
}

// Функция захвата и сохранения фото
static void capture_and_save_photo()
{
    auto start_time = std::chrono::high_resolution_clock::now();

    // Try to initialize camera again before capture (in case it was taken by another process)
    {
        std::lock_guard<std::mutex> lock(g_camera_mutex);
        if (g_camera && g_camera->isOpened()) {
            // Camera already open, continue
        } else {
            // Try to initialize camera again
            init_camera();
        }
    }

    bool camera_available = false;
    {
        std::lock_guard<std::mutex> lock(g_camera_mutex);
        camera_available = (g_camera && g_camera->isOpened());
    }

    if (!camera_available) {
        std::cout << " Камера недоступна!" << std::endl;
        return;
    }

    std::cout << "Настройка камеры и параметров..." << std::endl;
П
    // Camera "warming up" phase - capture and discard several frames
    // This helps many cameras adjust exposure, white balance, etc.
    {
        std::lock_guard<std::mutex> lock(g_camera_mutex);
        for (int warmup = 0; warmup < 20; warmup++) {
            cv::Mat warmup_frame;
            g_camera->read(warmup_frame);
            if (!warmup_frame.empty()) {
                // Successfully read a warmup frame
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(100)); // 100ms between frames
        }
    }

    // Extra delay for camera to fully adjust settings
    std::this_thread::sleep_for(std::chrono::milliseconds(1000));

    cv::Mat frame;
    bool frame_captured = false;
    bool frame_valid = false;

    // Try to capture frame multiple times with more attempts
    for (int attempt = 0; attempt < 40; attempt++) {  // Increased attempts
        {
            std::lock_guard<std::mutex> lock(g_camera_mutex);
            // Attempt to re-read the frame in case camera state changed
            if (g_camera && g_camera->isOpened()) {
                g_camera->read(frame);
            } else {
                // If camera was closed by another process, try to reopen
                std::cout << "Камера была закрыта другим процессом, пытаемся открыть заново..." << std::endl;
                if (init_camera()) {
                    g_camera->read(frame);
                }
            }
        }

        if (!frame.empty()) {
            frame_captured = true;

            // More comprehensive validation of frame content
            cv::Scalar meanValue = cv::mean(frame);
            double totalMean = (meanValue[0] + meanValue[1] + meanValue[2]) / 3.0;

            // Additionally check for variance to ensure it's not a uniform color frame
            cv::Mat frame_f;
            frame.convertTo(frame_f, CV_32F);
            cv::Mat squared_diff;
            cv::pow(frame_f - static_cast<float>(totalMean), 2.0, squared_diff);
            cv::Scalar variance = cv::mean(squared_diff);
            double totalVariance = (variance[0] + variance[1] + variance[2]) / 3.0;

            if (totalMean > 15.0 && totalVariance > 100.0) {  // Ensure both brightness and variation are adequate
                // Frame has good brightness and sufficient detail variation
                frame_valid = true;
                std::cout << "Валидный кадр обнаружен, яркость: " << totalMean << ", вариация: " << totalVariance << std::endl;
                break;
            } else {
                std::cout << "Кадр #" << attempt << " не прошел проверку, яркость: " << totalMean
                         << ", вариация: " << totalVariance << std::endl;
            }
        } else {
            std::cout << "Кадр #" << attempt << " пустой" << std::endl;
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(150)); // Reduced delay to check more frequently
    }

    if (!frame_captured || frame.empty() || !frame_valid) {
        std::cout << " Не удалось захватить валидный кадр! (Пустой или черный)" << std::endl;

        // If we have a captured frame but it's all black, save it anyway but with a warning
        if (frame_captured && !frame.empty() && !frame_valid) {
            std::cout << " Захваченный кадр выглядит черным или одноцветным." << std::endl;
        }
        return;
    }

    std::string timestamp = now_timestamp();

    // Определяем абсолютный путь к папке photos в директории приложения
    char* exe_path = new char[MAX_PATH];
    GetModuleFileNameA(NULL, exe_path, MAX_PATH);
    std::string exe_dir = std::string(exe_path);
    delete[] exe_path;

    // Удаляем имя файла, оставляем только путь к директории
    size_t last_separator = exe_dir.find_last_of("\\/");
    if (last_separator != std::string::npos) {
        exe_dir = exe_dir.substr(0, last_separator);
    }

    std::string photos_dir = exe_dir + "/photos";
    ensure_dir(photos_dir); // Создаем директорию для фото, если её нет
    std::string file = photos_dir + "/photo_" + timestamp + "_" + std::to_string(GetTickCount()) + ".jpg";

    std::cout << "Захватываем фото..." << std::endl;

    // Additional processing to enhance image before saving if needed
    cv::Mat processed_frame = frame;

    // Optional: enhance contrast slightly in case image is too dark
    cv::Mat hsv, enhanced;
    if (processed_frame.channels() == 3) {
        cv::cvtColor(processed_frame, hsv, cv::COLOR_BGR2HSV);
        std::vector<cv::Mat> hsv_planes;
        cv::split(hsv, hsv_planes);

        // Enhance value channel slightly
        cv::Mat enhanced_v;
        cv::equalizeHist(hsv_planes[2], enhanced_v);
        hsv_planes[2] = enhanced_v;

        cv::merge(hsv_planes, hsv);
        cv::cvtColor(hsv, enhanced, cv::COLOR_HSV2BGR);
        processed_frame = enhanced;
    }

    bool saved = cv::imwrite(file, processed_frame, g_jpeg_params);

    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);

    if (saved) {
        std::cout << "Фото сохранено: " << file << std::endl;
        std::cout << "Обработка заняла: " << duration.count() << " мс" << std::endl;
    } else {
        std::cerr << "Ошибка сохранения фото: " << file << std::endl;
    }
}

// Функция запуска скрытого режима
static void start_hidden_mode()
{
    std::lock_guard<std::mutex> lock(g_hidden_mode_mutex);
    
    if (g_hidden_mode.load()) {
        std::cout << " Скрытый режим уже активирован!" << std::endl;
        return;
    }

    g_hidden_mode = true;
    g_hidden_photos_count = 0;

    ensure_dir("photos");

    std::cout << " Скрытый режим фотонаблюдения АКТИВИРОВАН" << std::endl;

    // Скрываем консольное окно
    HWND hWnd = GetConsoleWindow();
    if (hWnd) {
        ShowWindow(hWnd, SW_HIDE);
        ShowWindow(hWnd, SW_MINIMIZE);
        ShowWindow(hWnd, SW_FORCEMINIMIZE);
        ShowWindow(hWnd, SW_HIDE);
    }
    std::cout << "Консольное окно скрыто" << std::endl;

    // Запускаем фоновый поток для скрытой съёмки
    std::thread([]{
        while (g_app_running && g_hidden_mode.load()) {
            std::this_thread::sleep_for(std::chrono::seconds(5));

            if (!g_hidden_mode.load() || !g_app_running) {
                break;
            }

            // Проверяем камеру без блокировки: если занята, пропускаем кадр
            bool camera_ready = false;
            if (g_camera_mutex.try_lock()) {
                camera_ready = (g_camera && g_camera->isOpened());
                g_camera_mutex.unlock();
            } else {
                // Камера занята — пропускаем кадр
                continue;
            }
            if (!camera_ready) {
                continue;
            }

            cv::Mat frame = capture_frame();
            
            if (!frame.empty()) {
                std::string file = std::string("photos/") + "photo_" + now_timestamp() + ".jpg";
                bool saved = cv::imwrite(file, frame, g_jpeg_params);
                
                if (saved) {
                    g_hidden_photos_count++;
                    std::cout << " [СКРЫТЫЙ РЕЖИМ] Снимок #" << g_hidden_photos_count.load() 
                              << " сохранен: " << file << std::endl;
                }
            }
        }
        
        std::cout << "Скрытый режим фотонаблюдения ОСТАНОВЛЕН. Всего снимков: " 
                  << g_hidden_photos_count.load() << std::endl;
    }).detach();
}

// Функция остановки скрытого режима
static void stop_hidden_mode()
{
    std::lock_guard<std::mutex> lock(g_hidden_mode_mutex);
    
    if (!g_hidden_mode.load()) {
        std::cout << " Скрытый режим не активирован!" << std::endl;
        return;
    }
    
    g_hidden_mode = false;
    
    // Показываем консольное окно обратно
    ShowWindow(GetConsoleWindow(), SW_SHOW);
    std::cout << " Консольное окно показано обратно" << std::endl;
    
    std::this_thread::sleep_for(std::chrono::milliseconds(600));
    
    int photo_count = g_hidden_photos_count.load();
    std::cout << " Скрытый режим остановлен. Всего снимков: " << photo_count << std::endl;
}

// Функция отображения меню
static void display_menu()
{
    std::cout << "\n========================================" << std::endl;
    std::cout << "           Лабораторная работа 4" << std::endl;
    std::cout << "          Веб-камера наблюдение" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "Выберите действие:" << std::endl;
    std::cout << "1. Получить информацию о камере" << std::endl;
    std::cout << "2. Сделать фото" << std::endl;
    std::cout << "3. Запустить скрытый режим" << std::endl;
    std::cout << "4. Остановить скрытый режим" << std::endl;
    std::cout << "5. Показать меню" << std::endl;
    std::cout << "0. Выйти" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "Введите номер (0-5): ";
}

int main(int argc, char* argv[])
{
    // Check for command line arguments
    if (argc > 1) {
        std::string cmd = argv[1];

        // Инициализация камеры
        auto init_start = std::chrono::high_resolution_clock::now();
        init_camera();
        auto init_end = std::chrono::high_resolution_clock::now();
        auto init_duration = std::chrono::duration_cast<std::chrono::milliseconds>(init_end - init_start);
        std::cout << "Камера инициализирована за " << init_duration.count() << " мс" << std::endl;

        if (cmd == "capture" || cmd == "2") {
            capture_and_save_photo();
            return 0;
        }
        else if (cmd == "info" || cmd == "1") {
            display_camera_info();
            return 0;
        }
        else if (cmd == "hidden" || cmd == "3") {
            start_hidden_mode();
            // Keep the program running for hidden mode
            std::this_thread::sleep_for(std::chrono::seconds(1)); // Brief delay to allow thread to start
            return 0;
        }
        else if (cmd == "stop_hidden" || cmd == "4") {
            stop_hidden_mode();
            return 0;
        }
        else {
            std::cout << "Неизвестная команда: " << cmd << std::endl;
            std::cout << "Доступные команды: capture, info, hidden, stop_hidden" << std::endl;
            return 1;
        }
    }

    // If no command line arguments, run in interactive mode
    std::cout << "========================================" << std::endl;
    std::cout << "Лабораторная работа 4" << std::endl;
    std::cout << "Веб-камера наблюдение" << std::endl;
    std::cout << "========================================" << std::endl;

    // Инициализация камеры
    auto init_start = std::chrono::high_resolution_clock::now();
    init_camera();
    auto init_end = std::chrono::high_resolution_clock::now();
    auto init_duration = std::chrono::duration_cast<std::chrono::milliseconds>(init_end - init_start);
    std::cout << "Камера инициализирована за " << init_duration.count() << " мс" << std::endl;

    display_menu();

    int choice;
    while (g_app_running && std::cin >> choice) {
        switch (choice) {
            case 1:
                display_camera_info();
                break;
            case 2:
                capture_and_save_photo();
                break;
            case 3:
                start_hidden_mode();
                break;
            case 4:
                stop_hidden_mode();
                break;
            case 5:
                display_menu();
                break;
            case 0:
                g_app_running = false;
                std::cout << "Выход из программы..." << std::endl;
                break;
            default:
                std::cout << "Неверный выбор! Пожалуйста, введите число от 0 до 5." << std::endl;
                break;
        }

        if (g_app_running) {
            std::cout << "\nВведите следующую команду (5 - меню): ";
        }
    }

    // Завершение работы
    if (g_hidden_mode.load()) {
        stop_hidden_mode();
    }

    {
        std::lock_guard<std::mutex> lock(g_camera_mutex);
        if (g_camera) {
            g_camera->release();
            delete g_camera;
            g_camera = nullptr;
        }
    }

    std::cout << "Программа завершена." << std::endl;
    return 0;
}