cmake_minimum_required(VERSION 3.10)
project(Lab4)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Set OpenCV directory to the local installation
set(OpenCV_DIR "${CMAKE_CURRENT_SOURCE_DIR}/opencv-4.12.0/lib/cmake/opencv4")

# Find OpenCV
find_package(OpenCV REQUIRED)

# Include OpenCV headers
include_directories(${OpenCV_INCLUDE_DIRS})

# Add the executable
add_executable(main main.cpp)

# On Windows, set the WIN32_EXECUTABLE property to hide console window
if(WIN32)
    set_target_properties(main PROPERTIES WIN32_EXECUTABLE TRUE)
endif()

# Link OpenCV libraries
target_link_libraries(main ${OpenCV_LIBS})

# Copy DLLs to output directory if on Windows
if(WIN32)
    # List of OpenCV DLLs that need to be copied
    set(OPENCV_DLLS
        libopencv_core4120.dll
        libopencv_highgui4120.dll
        libopencv_imgproc4120.dll
        libopencv_imgcodecs4120.dll
        libopencv_videoio4120.dll
        libopencv_video4120.dll
        libopencv_dnn4120.dll
        libopencv_features2d4120.dll
        libopencv_objdetect4120.dll
        libopencv_photo4120.dll
        libopencv_calib3d4120.dll
        libopencv_flann4120.dll
        libopencv_gapi4120.dll
        libopencv_ml4120.dll
        libopencv_stitching4120.dll
    )

    # Copy OpenCV DLLs to the executable directory
    foreach(dll ${OPENCV_DLLS})
        if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/${dll}")
            add_custom_command(TARGET main POST_BUILD
                COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${CMAKE_CURRENT_SOURCE_DIR}/${dll}"
                $<TARGET_FILE_DIR:main>)
        endif()
    endforeach()
endif()